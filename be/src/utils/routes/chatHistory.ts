import { Router } from "express";
import prisma from "../prisma";
import { supabase } from "../supabase";
import verifyAuth from "../../middleware/verifyAuth";

const router = Router();

router.post('/getUserHistory', verifyAuth, async (req, res) => {
    const { userId } = req.body;
    const userHistory = await prisma.video.findMany({
        where: {
            userId: userId,
        },
        select: {
            videoId: true,
            createdAt: true,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
    res.status(200).json({ userHistory });
});

router.post('/getChatHistory', verifyAuth, async (req, res) => {
    const { userId, videoId } = req.body;
    console.log(userId, videoId);
    const chatHistory = await prisma.video.findFirst({
        where: {
            videoId: parseInt(videoId),
            userId: userId,
        },
    });
    console.log(chatHistory===null);
    if(chatHistory){
        // Fetch video URLs for each chat message
        const chatHistoryWithUrls = await Promise.all(
            chatHistory.prompt.map(async (message: any, index: number) => {
                try {
                    // Get signed URL for the video file
                    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                        .from('manim-bolt')
                        .createSignedUrl(`${userId}/${videoId}/temp-${index + 1}.mp4`, 3600);
                    
                    if (signedUrlError) {
                        console.error('Error getting signed URL:', signedUrlError);
                        return {
                            ...message,
                            videoUrl: null,
                            errormessage: "Failed to load video"
                        };
                    }
                    
                    return {
                        ...message,
                        videoUrl: signedUrlData.signedUrl
                    };
                } catch (error) {
                    console.error('Error fetching video URL:', error);
                    return {
                        ...message,
                        videoUrl: null,
                        errormessage: "Failed to load video"
                    };
                }
            })
        );
        
        res.status(200).json({ chatHistory: chatHistoryWithUrls, shouldInitialize: false });
        return;
    }
    else{
        res.status(200).json({ chatHistory: [], shouldInitialize: true });
    }
});

export default router;