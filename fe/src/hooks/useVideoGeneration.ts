import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import type { ChatMessage, Result } from '../components/screens/PreviewScreen';

export const useVideoGeneration = (userId: string, videoId: string) => {
    const [isLoading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [promptData, setPromptData] = useState<ChatMessage[]>([{
        prompt: localStorage.getItem('prompt') as string,
        pythonCode: '',
    }]);
    const eventSourceRef = useRef<EventSource | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const handleEventSource = useCallback((eventSource: EventSource) => {
        eventSource.onmessage = (event) => {
            try {
                const safeData = JSON.parse(event.data) as unknown as Result;
                console.log('EventSource received data:', safeData);

                // Handle initial connection message
                if (safeData.status === "connected") {
                    console.log('SSE connection established');
                    return;
                }

                if (safeData.status === "error") {
                    setErrorMessage(safeData.errormessage!);
                    setLoading(false);
                    eventSource.close();
                    return;
                }

                if (safeData.status === "close") {
                    setLoading(false);
                    eventSource.close();
                    return;
                }

                setPromptData(prev => {
                    const lastPrompt = prev[prev.length - 1];
                    const updatedLastPrompt = {
                        ...lastPrompt,
                        pythonCode: safeData.pythonCode ?? '',
                        videoUrl: safeData.videoUrl ?? lastPrompt.videoUrl,
                        errormessage: safeData.errormessage ?? lastPrompt.errormessage
                    };
                    return [...prev.slice(0, -1), updatedLastPrompt];
                });
            } catch (error) {
                console.error("Error parsing event data:", error);
                setErrorMessage("Failed to process server response");
                setLoading(false);
                eventSource.close();
            }
        };

        eventSource.onerror = (error) => {
            console.error("EventSource error:", error);
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
                { withCredentials: true }
            );
        } catch (error) {
            console.error("Error submitting video prompt:", error);
            setErrorMessage("Failed to submit video prompt. Please try again.");
            setLoading(false);
        }
    }, [userId, videoId]);

    const initializeConnection = useCallback(async (prompt: string) => {
        try {
            setLoading(true);
            setErrorMessage('');
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
            const es = new EventSource(
                `${import.meta.env.VITE_SERVER_URL}/api/v1/execute/job-events/${userId}/${videoId}`,
                { withCredentials: true }
            );
            eventSourceRef.current = es;
            handleEventSource(es);
            await submitVideoPrompt(prompt);
            setLoading(false);
        } catch (error) {
            console.error("Error initializing connection:", error);
            setErrorMessage("Failed to initialize connection. Please refresh the page.");
            setLoading(false);
        }
    }, [userId, videoId, handleEventSource, submitVideoPrompt]);

    const handlePromptSubmit = () => {
        if (inputValue.length > 0) {
            localStorage.setItem("prompt", inputValue);
            setPromptData(prev => {
                const newPrompts: ChatMessage[] = [
                    ...prev,
                    {
                        prompt: inputValue,
                        pythonCode: '',
                    }
                ];
                return newPrompts;
            });
            setLoading(true);
            initializeConnection(inputValue);
            setInputValue('');
        }
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code);
    };

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [promptData, isLoading]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }
        };
    }, []);

    return {
        promptData,
        isLoading,
        errorMessage,
        inputValue,
        setInputValue,
        handlePromptSubmit,
        handleCopy,
        chatEndRef,
        initializeConnection
    };
}; 