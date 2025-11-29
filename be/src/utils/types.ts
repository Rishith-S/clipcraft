export interface QueueObject {
  userId: string;
  videoId: string;
  userPrompt: string;
  failureAttempts: number;
  delayBeforeTrials: number;
  previousError?: string;
}

export interface Result {
  status: string;
  errormessage?: string;
  videoUrl?: string;
  pythonCode?: string;
}
