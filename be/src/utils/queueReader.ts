import { OpenRouter } from "@openrouter/sdk";
import { Redis } from "@upstash/redis";
import { exec, spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { promisify } from "util";
import getPrompt from '../utils/prompt';
import { supabase } from '../utils/supabase';
import { QueueObject } from "./types";
import { notifySSEClients } from './sse';
import prisma from './prisma';

let isProcessing = false;
let shouldContinueProcessing = true;

const execAsync = promisify(exec);

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Extract Python code from LLM response
function extractPythonCode(llmResponse: string): string | null {
    const match = llmResponse.match(/```python([\s\S]*?)```/);
    return match ? match[1].trim() : null;
}

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "", // Ensure API key is loaded
});

async function validateCodeSecurity(code: string): Promise<string | null> {
    return new Promise((resolve) => {
        const validatorPath = path.join(__dirname, 'security_validator.py');

        const pythonProcess = spawn('python3', [validatorPath]);

        let stderr = '';

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pythonProcess.on('close', (exitCode) => {
            if (exitCode !== 0) {
                resolve(stderr.trim() || "Unknown security validation error");
            } else {
                resolve(null);
            }
        });

        pythonProcess.on('error', (err) => {
            resolve(`Failed to spawn validator process: ${err.message}`);
        });

        pythonProcess.stdin.write(code);
        pythonProcess.stdin.end();
    });
}



// Helper to handle retries with error feedback (Self-Correction)
async function handleRetry(promptDetails: QueueObject, errorMessage: string) {
    console.error(`Job failed for user ${promptDetails.userId}. Error: ${errorMessage}`);

    if (promptDetails.failureAttempts > 0) {
        console.log(`Retrying... Attempts left: ${promptDetails.failureAttempts}`);

        // Extract the last 20 lines of the error message to avoid overflowing the context window
        const truncatedError = errorMessage.split('\n').slice(-20).join('\n');

        const retryPromptDetails: QueueObject = {
            ...promptDetails,
            failureAttempts: promptDetails.failureAttempts - 1,
            delayBeforeTrials: promptDetails.delayBeforeTrials + 2,
            previousError: truncatedError, // Feed back the error for self-correction
        };

        setTimeout(async () => {
            await redis.lpush("prompts", retryPromptDetails);
            processQueue();
        }, promptDetails.delayBeforeTrials * 1000);
    } else {
        // No more retry attempts, notify client of failure
        notifySSEClients(promptDetails.userId, promptDetails.videoId, {
            status: 'error',
            errormessage: `Failed to generate video after multiple attempts. Last error: ${errorMessage}`
        });
    }
}

export default async function processQueue() {
    if (isProcessing) {
        return;
    }
    isProcessing = true;
    try {
        while (shouldContinueProcessing) {
            const promptDetails: QueueObject = (await redis.rpop(
                "prompts"
            )) as any;
            try {
                if (!promptDetails) {
                    break;
                }
                // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
                // const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                // const apiKey = process.env.OPENAI_API_KEY;
                // const client = new OpenAI({ apiKey: apiKey });
                // const apiKey = process.env.OPENAI_API_KEY;
                // const client = new OpenAI({ apiKey: apiKey });
                let prompt = getPrompt(promptDetails.userPrompt, promptDetails.previousError);
                const video = await prisma.video.findFirst({
                    where: {
                        userId: promptDetails.userId,
                        videoId: parseInt(promptDetails.videoId),
                    },
                })

                // Check if user has exceeded the maximum number of videos (5) only when creating a new video
                if (!video) {
                    const userVideoCount = await prisma.video.count({
                        where: {
                            userId: promptDetails.userId,
                        },
                    });

                    if (userVideoCount >= 5) {
                        notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                            status: 'error',
                            errormessage: "Video limit exceeded. Maximum 5 videos allowed per user."
                        });
                        return;
                    }
                }

                // Check if prompt limit exceeded (max 5 prompts per video)
                if (video && video.prompt.length >= 5) {
                    notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                        status: 'error',
                        errormessage: "Prompt limit exceeded. Maximum 5 prompts allowed per video."
                    });
                    return;
                }

                if (video) {
                    prompt += `\n\nThe user has already created a video with the same prompt. Please edit the video to the user's request. The user's previous prompt was ${JSON.stringify(video.prompt)}`;
                }
                try {
                    const result = await openRouter.chat.send({
                        messages: [{ role: 'user', content: prompt }],
                        model: "x-ai/grok-4.1-fast",
                        stream: true,
                        streamOptions: {
                            includeUsage: true
                        }
                    });
                    let text = "";
                    for await (const chunk of result) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            text += content;
                            process.stdout.write(content);
                        }
                    }
                    const pythonCode = extractPythonCode(text as string);
                    if (!pythonCode) {
                        console.error("No valid Python code found in LLM response.");
                        notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                            status: 'error',
                            errormessage: "No valid Python code found in AI response. Please try again with a different prompt."
                        });
                        return;
                    }

                    // Level 5: Static Analysis (Security & Syntax)
                    // This runs a local AST parser to catch syntax errors AND banned imports (os, sys, etc.)
                    // before we ever spin up the Docker container.
                    const validationError = await validateCodeSecurity(pythonCode);
                    if (validationError) {
                        console.error("Static Analysis Failed:", validationError);
                        // Feed the specific security/syntax error back to the LLM
                        await handleRetry(promptDetails, `Static Analysis Failed: ${validationError}`);
                        return;
                    }

                    const inputDir = path.join(process.cwd(), `manim_input/${promptDetails.userId}-${promptDetails.videoId}`);
                    const outputDir = path.join(process.cwd(), `manim_output/${promptDetails.userId}-${promptDetails.videoId}`);

                    try {
                        // Delete directories if they exist
                        await fs.rm(inputDir, { recursive: true, force: true });
                        await fs.rm(outputDir, { recursive: true, force: true });

                        // Create fresh directories
                        await fs.mkdir(inputDir, { recursive: true });
                        await fs.mkdir(outputDir, { recursive: true });

                        const inputFilePath = path.join(inputDir, "temp.py");
                        await fs.writeFile(inputFilePath, pythonCode);

                        try {
                            let dockerOutput = "";
                            if (process.env.MANIM_LOCAL === "1") {
                                // No Docker daemon (e.g. Render free tier): run manim directly on the host.
                                // The worker loop is single-threaded, so the shared staging dirs are safe.
                                await fs.copyFile(inputFilePath, "/manim_input/temp.py");
                                const { stdout } = await execAsync(`bash "${path.join(process.cwd(), "script.sh")}"`, { timeout: 10 * 60 * 1000 });
                                dockerOutput = stdout;
                                await fs.copyFile("/manim_output/Temp.mp4", path.join(outputDir, "Temp.mp4"));
                            } else {
                                // Pull the image if it doesn't exist
                                await execAsync("docker pull manimcommunity/manim");

                                const dockerCommand = [
                                    "docker run --rm -i",
                                    `-v "${inputDir}:/manim_input:ro"`,
                                    `-v "${outputDir}:/manim_output"`,
                                    `-v "${process.cwd()}/script.sh:/script.sh:ro"`,
                                    "--network=none",
                                    "--memory=512m --cpus=1",
                                    "manimcommunity/manim",
                                    "bash /script.sh"
                                ].join(" ");

                                try {
                                    const { stdout } = await execAsync(dockerCommand);
                                    dockerOutput = stdout;
                                } catch (dockerError: any) {
                                    // Level 5: Sandboxed Execution Failure -> Self-Correction
                                    const stderr = dockerError.stderr || dockerError.message;
                                    console.error("Docker execution failed:", stderr);
                                    await handleRetry(promptDetails, `Runtime Error during animation generation:\n${stderr}`);
                                    return; // Stop here, retry triggered
                                }
                            }

                            // Check if Temp.mp4 was created
                            const finalVideoPath = path.join(outputDir, "Temp.mp4");

                            // Level 5: Output Verification
                            try {
                                const stats = await fs.stat(finalVideoPath);
                                if (stats.size < 1024) { // Less than 1KB is suspicious
                                    throw new Error("Generated video file is too small (likely empty or corrupted).");
                                }

                                // Level 5: Visual Content Verification (Parse Metrics from Docker Output)
                                // 1. Parse Duration
                                const durationMatch = dockerOutput.match(/METRIC_DURATION:([0-9.]+)/);
                                const totalDuration = durationMatch ? parseFloat(durationMatch[1]) : 0;

                                if (totalDuration <= 0) {
                                    throw new Error("Could not determine video duration from validation metrics.");
                                }

                                // 2. Parse Black Frames
                                const blackStart = dockerOutput.indexOf("METRIC_BLACK_DETECT_START");
                                const blackEnd = dockerOutput.indexOf("METRIC_BLACK_DETECT_END");

                                if (blackStart !== -1 && blackEnd !== -1) {
                                    const blackLog = dockerOutput.substring(blackStart, blackEnd);
                                    const regex = /black_duration:([0-9.]+)/g;
                                    let totalBlackDuration = 0;
                                    let match;
                                    while ((match = regex.exec(blackLog)) !== null) {
                                        totalBlackDuration += parseFloat(match[1]);
                                    }

                                    const blackRatio = totalBlackDuration / totalDuration;
                                    // If more than 90% of the video is black, consider it a failure
                                    if (blackRatio > 0.9) {
                                        const visualError = `Visual Validation Failed: Video is ${Math.round(blackRatio * 100)}% black frames. The animation likely failed to render visible objects.`;
                                        console.error("Visual verification failed:", visualError);
                                        await handleRetry(promptDetails, visualError);
                                        return;
                                    }
                                } else {
                                    console.warn("Black frame detection metrics not found in output.");
                                }

                            } catch (fileError: any) {
                                console.error("Output verification failed:", fileError);
                                await handleRetry(promptDetails, `Output Verification Failed: ${fileError.message}`);
                                return;
                            }

                            // Ensure bucket exists
                            const { error: bucketError } = await supabase.storage.getBucket('manim-bolt');
                            if (bucketError) {
                                console.log("Bucket 'manim-bolt' not found or inaccessible. Attempting to create...");
                                const { error: createError } = await supabase.storage.createBucket('manim-bolt', {
                                    public: false,
                                    fileSizeLimit: 52428800, // 50MB
                                    allowedMimeTypes: ['video/mp4']
                                });
                                if (createError) {
                                    console.error("Failed to automatically create bucket 'manim-bolt'. You must create this bucket manually in your Supabase dashboard.", createError);
                                } else {
                                    console.log("Successfully created bucket 'manim-bolt'");
                                }
                            }

                            // Upload output video file
                            const videoFileBuffer = await fs.readFile(finalVideoPath);
                            const { error: videoError } = await supabase.storage
                                .from('manim-bolt')
                                .upload(`${promptDetails.userId}/${promptDetails.videoId}/temp-${(video?.prompt?.length || 0) + 1}.mp4`, videoFileBuffer, {
                                    contentType: 'video/mp4',
                                    upsert: true
                                });
                            if (videoError) {
                                console.error('Error uploading video file:', videoError);
                                throw videoError;
                            }
                            // Get a signed URL for the video file (valid for 1 hour)
                            const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                                .from('manim-bolt')
                                .createSignedUrl(`${promptDetails.userId}/${promptDetails.videoId}/temp-${(video?.prompt?.length || 0) + 1}.mp4`, 3600);

                            if (signedUrlError) {
                                console.error('Error getting signed URL:', signedUrlError);
                                throw signedUrlError;
                            }

                            if (video == null) {
                                await prisma.video.create({
                                    data: {
                                        userId: promptDetails.userId,
                                        videoId: parseInt(promptDetails.videoId),
                                        prompt: [{
                                            prompt: promptDetails.userPrompt,
                                            pythonCode: pythonCode,
                                        }],
                                    }
                                })
                            }
                            else {
                                if (video.prompt.length == 0) {
                                    await prisma.video.update({
                                        where: {
                                            id: video.id,
                                        },
                                        data: {
                                            prompt: {
                                                push: {
                                                    prompt: promptDetails.userPrompt,
                                                    pythonCode: pythonCode,
                                                }
                                            },
                                        }
                                    })
                                }
                                else {
                                    await prisma.video.update({
                                        where: {
                                            id: video.id,
                                        },
                                        data: {
                                            prompt: {
                                                push: {
                                                    prompt: promptDetails.userPrompt,
                                                    pythonCode: pythonCode,
                                                }
                                            },
                                        }
                                    })
                                }
                            }

                            notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                                videoUrl: signedUrlData.signedUrl,
                                pythonCode,
                                status: 'close'
                            })

                        } catch (err: any) {
                            console.error("Unexpected error during processing:", err);
                            await handleRetry(promptDetails, `Internal System Error: ${err.message}`);
                        } finally {
                            // Always clean up directories regardless of success or failure
                            try {
                                await fs.rm(inputDir, { recursive: true, force: true });
                                await fs.rm(outputDir, { recursive: true, force: true });
                            } catch (cleanupError) {
                                console.error("Error cleaning up directories:", cleanupError);
                            }
                        }

                    } catch (error) {
                        console.error("Error processing item:", error);
                        notifySSEClients(promptDetails.userId, promptDetails.videoId, { status: 'error', errormessage: "Internal server error" })
                    }

                } catch (error) {
                    console.error("Error processing item:", error);
                    notifySSEClients(promptDetails.userId, promptDetails.videoId, { status: 'error', errormessage: "Internal server error" })
                }

            } catch (error) {
                console.error("Error processing item:", error);
                if (promptDetails) {
                    notifySSEClients(promptDetails.userId, promptDetails.videoId, { status: 'error', errormessage: "Internal server error" })
                }
            }
        }
    } catch (error) {
        console.error("Fatal error in queue processor:", error);
    } finally {
        isProcessing = false;
    }
}

export function stopProcessing() {
    shouldContinueProcessing = false;
}