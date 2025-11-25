import {
    ArrowUp,
    Camera,
    Copy,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';

export interface Result {
    status: string;
    errormessage?: string;
    videoUrl?: string;
    pythonCode?: string;
}

export interface ChatMessage {
    prompt: string;
    pythonCode?: string;
    errormessage?: string;
    videoUrl?: string;
}

export default function PreviewScreen() {
    const { videoId } = useParams<{ videoId: string }>();
    const userId = localStorage.getItem('email');
    const [isLoading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [promptData, setPromptData] = useState<ChatMessage[]>([]);
    const [type, setType] = useState(false);
    const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
    const [showChat, setShowChat] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const handleEventSource = useCallback((eventSource: EventSource) => {
        eventSource.onmessage = (event) => {
            try {
                const safeData = JSON.parse(event.data) as Result;
                if (safeData.status === "connected") {
                    return;
                }
                if (safeData.status === "error") {
                    setErrorMessage(safeData.errormessage || "An error occurred.");
                    setLoading(false);
                    eventSource.close();
                    return;
                }
                if (safeData.status === "close") {
                    setLoading(false);
                    getChatHistory();
                    eventSource.close();
                    return;
                }
            } catch (error) {
                console.error("Error parsing event data:", error);
                setErrorMessage("Failed to process server response");
                setLoading(false);
                eventSource.close();
            }
        };
        eventSource.onerror = () => {
            setErrorMessage("Connection to server lost");
            setLoading(false);
            eventSource.close();
        };
    }, []);

    const submitVideoPrompt = useCallback(async (prompt: string) => {
        try {
            await axios.post(
                `${import.meta.env.VITE_SERVER_URL}/api/v1/execute/videoPrompt`,
                { userId, videoId, userPrompt: prompt, type: false },
                {
                    withCredentials: true,
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                    },
                }
            );
        } catch (error) {
            console.error("Error submitting video prompt:", error);
            setErrorMessage("Failed to submit video prompt. Please try again.");
            setLoading(false);
        }
    }, [userId, videoId]);

    const initializeConnection = useCallback(async (prompt: string) => {
        if (!prompt.trim()) {
            console.warn("Empty prompt provided to initializeConnection");
            return;
        }

        try {
            setLoading(true);
            setErrorMessage('');
            // Always close existing connection first
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            const token = localStorage.getItem('accessToken');
            const es = new EventSource(
                `${import.meta.env.VITE_SERVER_URL}/api/v1/execute/job-events/${userId}/${videoId}?token=${token}`,
                { withCredentials: true }
            );
            eventSourceRef.current = es;
            handleEventSource(es);
            await submitVideoPrompt(prompt);
        } catch (error) {
            console.error("Error initializing connection:", error);
            setErrorMessage("Failed to initialize connection. Please refresh the page.");
            setLoading(false);
        }
    }, [userId, videoId, handleEventSource, submitVideoPrompt]);

    const getChatHistory = async () => {
        try {
            setLoading(true);
            const res = await axios.post(`${import.meta.env.VITE_SERVER_URL}/api/v1/chatHistory/getChatHistory`, {
                userId,
                videoId,
            }, {
                withCredentials: true,
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                },
            });
            const chatHistory = (res.data as { chatHistory: ChatMessage[] }).chatHistory;
            const shouldInit = (res.data as { shouldInitialize: boolean }).shouldInitialize;

            setPromptData(chatHistory);
            setType(shouldInit);

            if (chatHistory.length > 0) {
                setSelectedVideoIndex(chatHistory.length - 1);
            }
        } catch (error) {
            console.error("Error getting chat history:", error);
            setErrorMessage("Failed to get chat history. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Separate useEffect for handling type changes
    useEffect(() => {
        const handleInitialization = async () => {
            if (type) {
                const savedPrompt = localStorage.getItem('prompt');
                if (savedPrompt) {
                    try {
                        await initializeConnection(savedPrompt);
                    } catch (error) {
                        console.error("Error during initialization:", error);
                        setErrorMessage("Failed to initialize with saved prompt.");
                    }
                }
            }
        };

        handleInitialization();
    }, [type, initializeConnection]);

    // Separate useEffect for initial load and cleanup
    useEffect(() => {
        getChatHistory();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, [videoId]);

    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [promptData, isLoading]);

    useEffect(() => {
        if (errorMessage) {
            toast.error(errorMessage);
            setErrorMessage('');
        }
    }, [errorMessage]);

    useEffect(() => {
        if (
            promptData.length > 0 &&
            promptData[promptData.length - 1].videoUrl
        ) {
            setSelectedVideoIndex(promptData.length - 1);
            setLoading(false);
        }
    }, [promptData]);

    const handlePromptSubmit = () => {
        if (inputValue.trim().length > 0) {
            localStorage.setItem("prompt", inputValue);
            setPromptData(prev => {
                const newPrompts: ChatMessage[] = [
                    ...prev,
                    {
                        prompt: inputValue,
                        pythonCode: '',
                    }
                ];
                setSelectedVideoIndex(newPrompts.length - 1);
                return newPrompts;
            });
            initializeConnection(inputValue);
            setInputValue('');
        }
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code);
    };

    const videoUrl = selectedVideoIndex < promptData.length
        ? promptData[selectedVideoIndex]?.videoUrl
        : promptData[promptData.length - 1]?.videoUrl;

    return (
        <div className="pt-16 lg:pt-32 mt-2 flex flex-col z-10 overflow-hidden bg-gray-75 text-white">
            {/* Error message is handled by toast, so no need to render here */}
            <div className="flex flex-col lg:flex-row w-screen h-full relative">
                {showChat && (
                    <div
                        className="lg:hidden fixed inset-0 bg-black/50 z-10"
                        onClick={() => setShowChat(false)}
                    />
                )}
                {/* Sidebar - Mobile: slide-out panel, Desktop: 35% */}
                <aside className={`${showChat ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:block lg:w-[35%] bg-gray-75 border-r border-gray-50 flex flex-col h-full absolute lg:relative z-20 lg:z-auto w-[85%] lg:w-[35%] transition-transform duration-300 ease-in-out`}>
                    <div className="p-4 h-full flex-grow overflow-y-auto transition-all duration-300 no-scrollbar">
                        {promptData.length > 0 && promptData.map((msg, index) => (
                            <div key={index} className="flex flex-col mt-4">
                                {/* Prompt bubble: always right-aligned */}
                                <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-md mb-1 bg-gradient-to-br from-blue-500 to-blue-700 text-white self-end">{msg.prompt}</div>
                                {/* Python code: always left-aligned if present */}
                                {msg.pythonCode && (
                                    <div className="relative group max-w-[85%] mt-2 self-start">
                                        <div className="w-full bg-black rounded-xl">
                                            <div className="w-full flex flex-row items-center gap-2 justify-between border-b border-blue-400 px-4 py-2">
                                                <div>python</div>
                                                <button
                                                    onClick={() => handleCopy(msg.pythonCode!)}
                                                    aria-label="Copy Python code"
                                                    className="opacity-0 group-hover:opacity-100 border-1 border-gray-600 text-gray-600 px-2 py-1 rounded-md flex flex-row items-center gap-2 hover:text-gray-300 hover:border-gray-300 cursor-pointer transition-opacity duration-200"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                    <p>copy</p>
                                                </button>
                                            </div>
                                            <SyntaxHighlighter
                                                language="python"
                                                style={vscDarkPlus}
                                                customStyle={{
                                                    padding: 16,
                                                    margin: 0,
                                                    borderRadius: '0.5rem',
                                                    backgroundColor: 'black'
                                                }}
                                                wrapLongLines={true}
                                                wrapLines={true}
                                            >
                                                {msg.pythonCode.length > 2000
                                                    ? `${msg.pythonCode.slice(0, 1000)}...\n\n// Code truncated for display. Copy and paste in your own editor for full code.`
                                                    : msg.pythonCode}
                                            </SyntaxHighlighter>
                                        </div>
                                    </div>
                                )}
                                {msg.errormessage && (
                                    <div className='w-full max-w-[85%] p-4 text-red-500 border border-red-500/20 rounded-xl mt-2 bg-red-950/30 self-start'>
                                        <div className='flex items-center gap-2 mb-2'>
                                            <AlertCircle className='w-4 h-4' />
                                            <span className='font-medium'>Error</span>
                                        </div>
                                        <p className='text-sm'>{msg.errormessage}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-center gap-2 mt-4">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <span className="text-xs text-gray-400 ml-2">ClipCraft is crafting...</span>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                    {/* Bottom section */}
                    <div className='flex p-4 flex-row justify-between border-t border-gray-25 bg-black gap-2 w-full transition-all duration-300 ease-in-out h-[10vh]'>
                        <div className="text-white flex-grow">
                            <textarea
                                name="promptbox"
                                id="prompt"
                                placeholder="Ask ClipCraft to create an animation..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="w-full h-12 resize-none bg-gray-75 border border-gray-50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-gray-25 transition-all duration-300 shadow-inner"
                                aria-label="Prompt input"
                            />
                        </div>
                        <button
                            onClick={handlePromptSubmit}
                            disabled={inputValue.trim().length === 0}
                            aria-label="Submit prompt"
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors text-black text-lg font-bold shadow-md ${inputValue.trim().length > 0
                                ? "bg-white hover:bg-blue-200 cursor-pointer"
                                : "bg-gray-400/85 cursor-not-allowed"
                                }`}
                        >
                            <ArrowUp className="w-5 h-5" strokeWidth={4} />
                        </button>
                    </div>
                </aside>
                {/* Main Content */}
                <main className="bg-gray-75 w-full h-full flex flex-col p-4 lg:p-6">
                    {/* Mobile Chat Toggle Button */}
                    <div className="lg:hidden flex justify-between items-center mb-4">
                        <h1 className="text-lg font-semibold text-white">ClipCraft</h1>
                        <button
                            onClick={() => setShowChat(!showChat)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            {showChat ? 'Hide Chat' : 'Show Chat'}
                        </button>
                    </div>

                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center w-full h-full">
                            <div className="w-16 h-16 mb-6">
                                <div className="w-full h-full bg-gray-600 rounded-2xl animate-pulse"></div>
                            </div>
                            <p className="text-gray-400 text-lg mb-8">Crafting your animation...</p>
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <Camera className="w-5 h-5 text-gray-500" />
                                    <span className="text-gray-400 text-sm">Instantly preview your changes</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <RefreshCw className="w-5 h-5 text-gray-500" />
                                    <span className="text-gray-400 text-sm">Physics based animations</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 flex items-center justify-center">
                                        <div className="w-3 h-3 bg-gray-500 rounded"></div>
                                    </div>
                                    <span className="text-gray-400 text-sm">Create animations with AI</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col flex-grow">
                            {/* Main video player */}
                            <div className="text-white text-sm mb-2">Animation {selectedVideoIndex + 1}</div>
                            {videoUrl ? (
                                <video
                                    controls
                                    className="w-full h-[60vh] lg:h-[80%] object-contain rounded-xl"
                                    src={videoUrl}
                                    onError={() => {
                                        setErrorMessage("Failed to load video. Please try again.");
                                    }}
                                >
                                    <source src={videoUrl} type="video/mp4" />
                                    Your browser does not support the video tag.
                                </video>
                            ) : (
                                <div className="text-gray-400 text-sm">No animation available</div>
                            )}
                            {/* Video thumbnails */}
                            <div className="mt-4 lg:mt-6">
                                <h3 className="text-gray-300 text-sm font-medium">Animation History</h3>
                                <div className="flex flex-row gap-2 lg:gap-3 overflow-x-auto custom-scrollbar mt-2 pt-2">
                                    {promptData.map((_, index) => (
                                        <div
                                            key={index}
                                            className={`flex flex-col items-center gap-1 lg:gap-2 min-w-[80px] lg:min-w-[120px] group cursor-pointer hover:scale-105 transition-all duration-200 ${selectedVideoIndex === index ? 'scale-105' : ''}`}
                                            onClick={() => setSelectedVideoIndex(index)}
                                            aria-label={`Select animation ${index + 1}`}
                                        >
                                            <div className={`w-16 h-16 lg:w-20 lg:h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all duration-200 flex items-center justify-center relative ${selectedVideoIndex === index
                                                ? 'border-blue-400 bg-blue-500/20 shadow-lg shadow-blue-400/25'
                                                : 'border-gray-600 bg-gradient-to-br from-gray-700 to-gray-800 hover:border-blue-400'
                                                }`}>
                                                <div className="w-full flex h-full bg-black object-cover items-center justify-center">
                                                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-white/20 rounded-full flex items-center justify-center">
                                                        <div className="w-0 h-0 border-l-[6px] lg:border-l-[8px] border-l-white border-t-[4px] lg:border-t-[6px] border-t-transparent border-b-[4px] lg:border-b-[6px] border-b-transparent ml-0.5 lg:ml-1"></div>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`text-xs font-medium transition-colors duration-200 ${selectedVideoIndex === index
                                                ? 'text-blue-400 font-semibold'
                                                : 'text-gray-400'
                                                }`}>
                                                Animation {index + 1}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
