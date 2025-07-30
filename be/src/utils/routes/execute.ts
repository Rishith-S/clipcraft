import express from 'express';
import redis from '../redis';
import { QueueObject } from '../types';
import processQueue from '../queueReader';
import { addSSEConnection, removeSSEConnection } from '../sse';
import prisma from '../prisma';
import verifyAuth from '../../middleware/verifyAuth';

const router = express.Router();

router.post('/getVideoId', verifyAuth, async (req, res) => {
    const { userId } = req.body;
    
    // Count existing videos for this user
    const videoCount = await prisma.video.count({
        where: {
            userId,
        }
    });
    
    // Check if user has reached the limit of 5 videos
    if (videoCount >= 5) {
        res.status(403).json({ 
            'error': 'Video limit reached', 
            'message': 'You can only create up to 5 videos. Please delete some videos to create new ones.' 
        });
        return;
    }
    
    // Find the highest videoId for this user
    const existingVideos = await prisma.video.findMany({
        where: {
            userId,
        },
        orderBy: {
            videoId: 'desc'
        },
        take: 1
    });
    
    // Calculate the next videoId (start from 1 if no videos exist)
    const nextVideoId = existingVideos.length > 0 ? existingVideos[0].videoId + 1 : 1;

    res.status(200).json({ 'videoId': nextVideoId });
    return;
});

router.post('/videoPrompt', verifyAuth, async (req, res) => {
    const {userPrompt,userId,videoId,type} = req.body;
    const queueObject : QueueObject = {
        userId,
        videoId,
        userPrompt,
        failureAttempts: 3,
        delayBeforeTrials: 2
    }
    await redis.lpush("prompts", queueObject);
    processQueue();
    res.status(200).json({ 'message': 'result' });
    return;
});

router.get('/job-events/:userId/:videoId', verifyAuth,(req, res) => {
    const { videoId, userId } = req.params;
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    });
  
    // Send initial connection message
    res.write('data: {"status": "connected"}\n\n');
  
    // Add this connection to our tracking
    addSSEConnection(userId, videoId, res);
  
    // Handle client disconnect
    req.on('close', () => {
      console.log("close")
      removeSSEConnection(userId, videoId, res);
      res.end();
    });
  });
  

export default router;