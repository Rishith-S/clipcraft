import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import axios from 'axios';
import Loader from '../utils/Loader';
import Modal from '../utils/Modal';
import { toast } from 'react-hot-toast';

interface Video {
    videoId: number;
    createdAt: Date;
}

interface PromptExample {
    id: number;
    title: string;
    prompt: string;
    videoUrl: string;
}

const Homepage = () => {
    const [inputValue, setInputValue] = useState('');
    const [brightness, setBrightness] = useState(25);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedExample, setSelectedExample] = useState<PromptExample | null>(null);

    const promptExamples: PromptExample[] = [
        {
            id: 1,
            title: "Prompt Example 1",
            prompt: `Create a Manim animation that shows a number line from -5 to 5.
Animate a dot moving smoothly from -3 to 4 along the number line.`,
            videoUrl: "/src/assets/videos/prompt-example-1.mp4",
        },
        {
            id: 2,
            title: "Prompt Example 2",
            prompt: `Create a Manim diagram showing the three-layer software architecture:
        
        Top box: Presentation Layer
        
        Middle box: Business Logic Layer
        
        Bottom box: Data Layer
        Stack them vertically, center aligned, with arrows pointing downward from each to the next.`,
            videoUrl: "/src/assets/videos/prompt-example-2.mp4",
        },
        {
            id: 3,
            title: "Prompt Example 3",
            prompt: `Create a Manim animation with three labeled boxes arranged horizontally.
Label the boxes:

Left: Frontend

Middle: Backend

Right: Database
Connect the boxes with arrows from left to right.
Use different colors for each box and add simple fade-in animation.`,
            videoUrl: "/src/assets/videos/prompt-example-3.mp4",
        },
    ];

    const texts = [
        "Create a math animation",
        "Show me a physics concept",
        "Visualize an algorithm",
        "Explain a scientific process",
        "Generate an educational video"
    ];
    const navigate = useNavigate();
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [currentText, setCurrentText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [loading, setLoading] = useState(false);

    // Brightness animation effect
    useEffect(() => {
        const timer = setTimeout(() => {
            setBrightness(100);
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    const [userHistory, setUserHistory] = useState<Video[]>([]);

    useEffect(() => {
        const getUserHistory = async () => {
            // Only fetch history if user is authenticated
            const accessToken = localStorage.getItem('accessToken');
            const email = localStorage.getItem('email');

            if (!accessToken || !email) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const res = await axios.post(`${import.meta.env.VITE_SERVER_URL}/api/v1/chatHistory/getUserHistory`, {
                    userId: localStorage.getItem('email'),
                }, {
                    withCredentials: true,
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                    },
                });
                setUserHistory((res.data as { userHistory: Video[] }).userHistory);
            } catch (error) {
                console.error('Error fetching user history:', error);
            } finally {
                setLoading(false);
            }
        }
        getUserHistory();
    }, []);

    useEffect(() => {
        const currentFullText = texts[currentTextIndex];

        const timeout = setTimeout(() => {
            if (!isDeleting) {
                // Typing forward
                if (currentText.length < currentFullText.length) {
                    setCurrentText(currentFullText.substring(0, currentText.length + 1));
                } else {
                    // Finished typing, wait then start deleting
                    setTimeout(() => setIsDeleting(true), 1500);
                }
            } else {
                // Backspacing
                if (currentText.length > 0) {
                    setCurrentText(currentText.substring(0, currentText.length - 1));
                } else {
                    // Finished deleting, move to next text
                    setIsDeleting(false);
                    setCurrentTextIndex((prev) => (prev + 1) % texts.length);
                }
            }
        }, 20); // Faster backspacing

        return () => clearTimeout(timeout);
    }, [currentText, isDeleting, currentTextIndex, texts]);

    const handlePromptSubmit = async () => {
        if (inputValue.length > 0) {
            // Check if user is authenticated
            const accessToken = localStorage.getItem('accessToken');
            const email = localStorage.getItem('email');

            if (!accessToken || !email) {
                // User is not authenticated, redirect to login
                navigate('/auth/login');
                return;
            }

            try {
                localStorage.setItem("prompt", inputValue);
                const res = await axios.post(`${import.meta.env.VITE_SERVER_URL}/api/v1/execute/getVideoId`, {
                    userId: localStorage.getItem('email'),
                }, {
                    withCredentials: true,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                });

                // Type assertion to handle the response data
                const responseData = res.data as { videoId: number };
                navigate(`/videos/${responseData.videoId}`);
            } catch (error: any) {
                if (error.response?.status === 403) {
                    // Handle video limit reached error
                    const errorMessage = error.response.data?.message || 'You can only create up to 5 videos.';
                    toast.error(errorMessage);
                } else {
                    console.error('Error creating video:', error);
                    toast.error('An error occurred while creating the video. Please try again.');
                }
            }
        }
    }

    const handleExampleClick = (example: PromptExample) => {
        setSelectedExample(example);
        setIsModalOpen(true);
    };

    const handleUseExample = (example: PromptExample) => {
        // Check if user is authenticated
        const accessToken = localStorage.getItem('accessToken');
        const email = localStorage.getItem('email');

        if (!accessToken || !email) {
            // User is not authenticated, redirect to login
            navigate('/auth/login');
            return;
        }

        setInputValue(example.prompt);
        setIsModalOpen(false);
        setSelectedExample(null);
        // Focus on the textarea
        const textarea = document.getElementById('prompt') as HTMLTextAreaElement;
        if (textarea) {
            textarea.focus();
        }
    };

    if (loading) {
        return (
            <div className='w-screen min-h-full z-10 overflow-y-auto bg-gray-50'>
                <Loader />
            </div>
        )
    }

    return (
        <div className='w-screen min-h-full z-10 overflow-y-auto bg-gray-50'>
            <div
                className="absolute h-[100%] w-[100%] z-20 pointer-events-none"
                style={{
                    backgroundImage: 'url("/src/assets/noise.png")',
                    backgroundRepeat: 'repeat',
                    opacity: 0.35
                }}
            />
            <div
                className="absolute left-1/2 h-[100%] w-full -translate-x-1/2 z-10 pointer-events-none transition-all duration-1000 ease-in-out"
                style={{
                    backgroundImage: 'url("/src/assets/gradient-optimized.svg")',
                    backgroundRepeat: 'repeat',
                    backgroundPosition: 'center top',
                    filter: `brightness(${brightness}%)`
                }}
            />
            <main className="relative z-30 flex flex-col items-center justify-center px-6">
                <div className="text-center mt-24 max-w-4xl">
                    <h1 className="text-2xl md:text-5xl font-bold mb-4 text-white">
                        Build something <span className='font-playful text-blue-100'>ClipCraft</span>
                    </h1>
                    <p className="text-lg mb-4 md:text-xl text-white">
                        Idea to video in seconds, with your personal <span className='underline font-playful text-yellow-100'>manim</span> video generator
                    </p>
                </div>

                {/* Input Section */}
                <div className="w-full max-w-4xl mt-10">
                    <div className="bg-gray-50/95 rounded-xl p-6">
                        <div className="mb-6 text-white">
                            <textarea
                                name="promptbox"
                                id="prompt"
                                placeholder={`Ask ClipCraft to create a ${currentText}`}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="text-white resize-none w-full bg-transparent text-lg placeholder-gray-400 focus:outline-none py-2 min-h-[100px]"
                            />
                        </div>

                        <div className="flex justify-between items-center">
                            {!localStorage.getItem('accessToken') && (
                                <div className="text-sm text-yellow-300">
                                    💡 Login to submit your prompt
                                </div>
                            )}
                            <button onClick={handlePromptSubmit} className={`w-8 h-8  rounded-full flex items-center justify-center ${inputValue.length > 0 ? "bg-white hover:bg-blue-200" : "bg-gray-400/85 cursor-not-allowed"}`}>
                                <ArrowUp className="w-4 h-4" strokeWidth={4} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Prompt Examples Section */}
                <div className="w-full max-w-4xl mt-6">
                    <div className="bg-gray-50/95 rounded-xl p-6">
                        <h3 className="text-white text-lg font-semibold mb-4">Try these examples:</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {promptExamples.map((example) => (
                                <div
                                    key={example.id}
                                    onClick={() => handleExampleClick(example)}
                                    className="bg-gray-25 rounded-lg p-4 cursor-pointer hover:bg-gray-75 transition-colors border border-gray-400/20 hover:border-gray-400/40"
                                >
                                    <h4 className="text-white font-medium mb-2">{example.title}</h4>
                                    <div className="mt-3 text-blue-400 text-xs font-medium">Click to preview →</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* User History Section - Only show for authenticated users */}
                {localStorage.getItem('accessToken') && localStorage.getItem('email') ? (
                    <div className='w-full max-w-4xl mt-10 mb-6'>
                        <div className="bg-gray-50/95 rounded-xl p-6">
                            <div className='flex items-center gap-3 mb-6'>
                                <div className='font-bold rounded-full h-12 w-12 items-center justify-center flex p-2 text-white bg-orange-600 text-lg'>{localStorage.getItem('name')?.charAt(0).toUpperCase()}</div>
                                <h2 className='text-white text-xl font-semibold'>My Animations</h2>
                                <span className='text-sm text-gray-400 font-medium bg-gray-25 px-2 py-1 rounded-full'>{userHistory.length} animations</span>
                            </div>

                            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                                <div
                                    onClick={() => {
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                        setInputValue('');
                                        const textarea = document.getElementById('prompt') as HTMLTextAreaElement;
                                        if (textarea) {
                                            textarea.focus();
                                        }
                                    }}
                                    className='bg-gray-25 flex flex-col items-center justify-center rounded-lg h-40 cursor-pointer transition-colors hover:bg-gray-75 border-2 border-dashed border-gray-400 hover:border-gray-300'
                                >
                                    <div className='text-4xl text-gray-400'>+</div>
                                    <p className='text-md text-gray-300 mt-2'>Create new animation</p>
                                </div>

                                {userHistory.map((video) => (
                                    <div onClick={() => { navigate(`/videos/${video.videoId}`) }} key={video.videoId} className='bg-gray-25 rounded-lg h-40 flex flex-col justify-between p-4 group cursor-pointer hover:bg-gray-75 transition-colors'>
                                        <div>
                                            <p className='text-white font-bold text-lg'>Animation #{video.videoId}</p>
                                            <p className='text-sm text-gray-400'>
                                                {new Date(video.createdAt).toLocaleDateString('en-US', {
                                                    year: 'numeric', month: 'short', day: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className='w-full max-w-4xl mt-10 mb-6'>
                        <div className="bg-gray-50/95 rounded-xl p-6">
                            <div className='flex items-center gap-3 mb-6'>
                                <div className='font-bold rounded-full h-12 w-12 items-center justify-center flex p-2 text-white bg-blue-600 text-lg'>👤</div>
                                <h2 className='text-white text-xl font-semibold'>Get Started</h2>
                            </div>

                            <div className='text-center py-8'>
                                <p className='text-gray-300 text-lg mb-4'>Login to create and save your animations</p>
                                <button
                                    onClick={() => navigate('/auth/login')}
                                    className='bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-200 transition-colors font-medium'
                                >
                                    Login to Continue
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Modal for Prompt Examples */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedExample(null);
                }}
                title={selectedExample?.title || "Prompt Example"}
            >
                {selectedExample && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">Prompt</h3>
                            <div className="bg-gray-25 rounded-lg p-4">
                                <p className="text-gray-200">{selectedExample.prompt}</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-medium text-white mb-2">Example Video</h3>
                            <div className="rounded-lg p-4">
                                <video
                                    controls
                                    className="w-full max-w-2xl aspect-video rounded-lg mx-auto"
                                    src={selectedExample.videoUrl}
                                    autoPlay
                                    muted
                                    loop
                                >
                                    <source src={selectedExample.videoUrl} type="video/mp4" />
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                        </div>

                        <div className="flex justify-end space-x-3 pt-4">
                            <button
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setSelectedExample(null);
                                }}
                                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handleUseExample(selectedExample)}
                                className="px-6 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium"
                            >
                                Use This Prompt
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Homepage;