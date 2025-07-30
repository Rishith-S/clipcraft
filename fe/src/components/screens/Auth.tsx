import { useEffect, useState } from 'react';
import GoogleIcon from '../../assets/svg/google';
import GithubIcon from '../../assets/svg/github';
import InputBox from './InputBox';
import { useNavigate, useParams } from 'react-router';
import axios from 'axios';
import type { UserDetails } from '../utils/Callback';
import { Turnstile } from '@marsidev/react-turnstile';

export default function Auth() {
    const {type} = useParams()
    const texts = [
        "Create a math animation",
        "Show me a physics concept",
        "Visualize an algorithm",
        "Explain a scientific process",
        "Generate an educational video"
    ];
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [currentText, setCurrentText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginOrSignup, setLoginOrSignup] = useState(type==='login'?true:false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [token,setToken] = useState("");
    const navigate = useNavigate();
    useEffect(() => {
        const currentFullText = texts[currentTextIndex];

        const timeout = setTimeout(() => {
            if (!isDeleting) {
                if (currentText.length < currentFullText.length) {
                    setCurrentText(currentFullText.substring(0, currentText.length + 1));
                } else {
                    setTimeout(() => setIsDeleting(true), 1500);
                }
            } else {
                if (currentText.length > 0) {
                    setCurrentText(currentText.substring(0, currentText.length - 1));
                } else {
                    setIsDeleting(false);
                    setCurrentTextIndex((prev) => (prev + 1) % texts.length);
                }
            }
        }, 20);

        return () => clearTimeout(timeout);
    }, [currentText, isDeleting, currentTextIndex, texts]);

    useEffect(() => {
        setLoginOrSignup(type === 'login');
        setError("");
        setToken("");
        setEmail("");
        setPassword("");
    }, [type]);

    const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        if (!email || !password) {
          setError("Please enter both email and password");
        } else {
          try {
            setError("");
            const res = await axios.post(`${import.meta.env.VITE_SERVER_URL}/api/v1/auth/${type==='login'?'login':'signup'}/email-and-password`,{
              name,
              email,
              password,
              token
            },{withCredentials:true,headers:{'Content-Type':'application/json'}});
            const data = res.data as any;
            if (data.statusCode === 404) {
              setError("Invalid email or password");
            } else if (data.statusCode === 403) {
              setError("Invalid reCAPTCHA token reload the page and try again");
            } else if (data.statusCode === 500) {
              setError("Internal server error");
            } else {
              const userDetails: UserDetails = res.data as unknown as UserDetails;
              localStorage.setItem("name", userDetails.name);
              localStorage.setItem("email", userDetails.email);
              localStorage.setItem("accessToken", userDetails.accessToken);
              navigate("/");
            }
          } catch (error: any) { 
            setError(error.response.data.message);
          } finally{
            setIsLoading(false);
          }
        }
      };
    
      const handleGoogleLogin = async () => {
        setIsLoading(true);
        setError("");
        try {
          const response = (await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/v1/auth/url/${loginOrSignup ? "login" : "signup"}`)) as any;
          window.location.assign(response.data.url);
        } catch (error: any) {
          console.log(error);
          if (error.response?.status === 401) {
            setError("Authentication failed. Please try again.");
          } else {
            navigate('/auth/login');
          }
        }
        finally{
          setIsLoading(false);
        }
      };

      const handleGithubLogin = async () => {
        setIsLoading(true);
        setError("");
        try {
          const response = (await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/v1/auth/github/url/${loginOrSignup ? "login" : "signup"}`)) as any;
          window.location.assign(response.data.url);
        } catch (error: any) {
          console.log(error);
          if (error.response?.status === 401) {
            setError("Authentication failed. Please try again.");
          } else {
            navigate('/auth/login');
          }
        }
        finally{
          setIsLoading(false);
        }
      };

    return (
        <div className="min-h-screen flex bg-gray-75">
            <div className="w-full md:w-1/2 bg-gray-75 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <div className='mb-8'>
                        <p className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-tr from-orange-400 via-pink-400 to-purple-400 font-playful">
                            ClipCraft
                        </p>
                    </div>
                    <p className="text-white text-3xl font-bold mb-8">{loginOrSignup ? "Login" : "Sign Up"}</p>
                    <div className="space-y-3 mb-6">
                        <button
                            className="w-full bg-gray-50 hover:bg-gray-800 border border-gray-25 rounded-lg py-1.5 px-4 text-white flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleGoogleLogin}
                        >
                            <GoogleIcon />
                            <span className="text-sm">{loginOrSignup ? "Login" : "Sign Up"} with Google</span>
                        </button>

                        <button
                            className="w-full bg-gray-50 hover:bg-gray-800 border border-gray-25 rounded-lg py-1.5 px-4 text-white flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={handleGithubLogin}
                            disabled={isLoading}
                        >
                            <GithubIcon />
                            <span className="text-sm">{loginOrSignup ? "Login" : "Sign Up"} with GitHub</span>
                        </button>
                    </div>

                    <div className="flex items-center mb-6">
                        <div className="flex-1 h-px bg-gray-200/10"></div>
                        <span className="px-4 text-gray-200/75 text-sm">OR</span>
                        <div className="flex-1 h-px bg-gray-200/10"></div>
                    </div>

                    {error && (
                        <div className="mb-4 text-red-400 text-center text-sm font-medium">{error}</div>
                    )}

                    <form onSubmit={handleEmailLogin}>
                        {
                            type==='signup' && (
                                <div className="mb-4">
                                    <InputBox value={name} setValue={setName} type="text" label='Name' disabled={isLoading} />
                                </div>
                            )
                        }

                        <div className="mb-4">
                            <InputBox value={email} setValue={setEmail} type="text" label='Email' disabled={isLoading} />
                        </div>

                        <div className="mb-6">
                            <InputBox value={password} setValue={setPassword} type="password" label='Password' disabled={isLoading} />
                        </div>

                        <Turnstile 
                            key={type} 
                            onSuccess={(token)=>{setToken(token)}} 
                            siteKey={`${import.meta.env.VITE_TURNSTILE_SITEKEY}`} 
                        />

                        <button
                            type="submit"
                            className="w-full bg-white text-black font-medium py-2 rounded-lg mb-6 hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span>Signing in...</span>
                            ) : (
                                loginOrSignup ? "Login" : "Sign Up"
                            )}
                        </button>
                    </form>

                    <div className="text-center space-y-4">
                        <p className="text-gray-400 text-sm">
                            Don't have an account? <span onClick={() => { navigate(`/auth/${loginOrSignup ? "signup" : "login"}`, { replace: true })  }} className="text-white underline cursor-pointer">{loginOrSignup ? "Sign Up" : "Login"}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="w-0 md:w-1/2 m-6 relative hidden md:flex items-center justify-center">
                <div className="bg-[url('/src/assets/image.webp')] rounded-lg w-full h-full bg-cover absolute" />
                <div className="absolute w-full px-24">
                    <div className="bg-white rounded-2xl flex flex-row justify-between items-center px-6 py-4">
                        <p className="text-gray-800 text-cente text-md">
                            Ask ClipCraft to {" "}
                            <span>
                                {currentText}
                                <span
                                    className={`transition-opacity duration-100 text-xl text-center text-blue-500`}
                                >
                                    {" "}|
                                </span>
                            </span>
                        </p>
                        <button className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center text-2xl p-6">
                            ↑
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}