// import { GoogleGenerativeAI } from "@google/generative-ai";
// import OpenAI from 'openai';
import { OpenRouter } from "@openrouter/sdk";
import { Redis } from "@upstash/redis";
import { exec } from "child_process";
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

// Basic code checks
function isCodeSafe(code: string): boolean {
    const bannedPatterns = [/import\s+os/, /import\s+sys/, /subprocess/, /open\s*\(/];
    return !bannedPatterns.some((pattern) => pattern.test(code));
}

const openRouter = new OpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "", // Ensure API key is loaded
});


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
                let prompt = getPrompt(promptDetails.userPrompt);
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

                    if (!isCodeSafe(pythonCode)) {
                        console.error("The extracted code contains unsafe patterns. Aborting.");
                        notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                            status: 'error',
                            errormessage: "The generated code contains unsafe patterns and cannot be executed."
                        });
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

                            await execAsync(dockerCommand);
                            // Check if Temp.mp4 was created
                            const finalVideoPath = path.join(outputDir, "Temp.mp4");
                            try {
                                await fs.access(finalVideoPath);
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

                            } catch {
                                console.error("Temp.mp4 not found after Docker run.");
                                if (promptDetails.failureAttempts != 0) {
                                    setTimeout(async () => {
                                        const retryPromptDetails: QueueObject = {
                                            userId: promptDetails.userId,
                                            videoId: promptDetails.videoId,
                                            userPrompt: promptDetails.userPrompt,
                                            failureAttempts: promptDetails.failureAttempts - 1,
                                            delayBeforeTrials: promptDetails.delayBeforeTrials + 2,
                                        };
                                        await redis.lpush("prompts", retryPromptDetails);
                                        processQueue()
                                    }, promptDetails.delayBeforeTrials * 1000);
                                } else {
                                    // No more retry attempts, notify client of failure
                                    notifySSEClients(promptDetails.userId, promptDetails.videoId, {
                                        status: 'error',
                                        errormessage: "Failed to generate video after multiple attempts. Please try again with a different prompt."
                                    });
                                }
                            }
                        } catch (err) {
                            console.error("Error running Docker:", err);
                            if (promptDetails.failureAttempts != 0) {
                                setTimeout(async () => {
                                    const retryPromptDetails: QueueObject = {
                                        userId: promptDetails.userId,
                                        videoId: promptDetails.videoId,
                                        userPrompt: promptDetails.userPrompt,
                                        failureAttempts: promptDetails.failureAttempts - 1,
                                        delayBeforeTrials: promptDetails.delayBeforeTrials + 2,
                                    };
                                    await redis.lpush("prompts", retryPromptDetails);
                                    processQueue()
                                }, promptDetails.delayBeforeTrials * 1000);
                            } else {
                                notifySSEClients(promptDetails.userId, promptDetails.videoId, { status: 'error', errormessage: "Failed to generate video after multiple attempts. Please try again." })
                            }
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
                console.error(error);
                notifySSEClients(promptDetails.userId, promptDetails.videoId, { status: 'error', errormessage: "Internal server error" })
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