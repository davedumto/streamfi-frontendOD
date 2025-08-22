"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Hls, { Level, ErrorTypes, ErrorData } from "hls.js";

interface StreamData {
  streamId?: string;
  playbackId?: string;
  streamKey?: string;
  title?: string;
  isLive?: boolean;
  currentViewers?: number;
  totalViews?: number;
  isConfigured?: boolean;
}

interface ChatMessage {
  id: string;
  content: string;
  messageType: string;
  user: {
    username: string;
    wallet: string;
    avatar?: string;
  };
  createdAt: string;
}

interface ApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
  streamData?: StreamData;
  metrics?: {
    stream?: {
      currentViewers?: number;
      totalViews?: number;
    };
  };
  src?: string;
  chatMessage?: ChatMessage;
  messages?: ChatMessage[];
}

interface VideoPlayerProps {
  playbackId: string;
  addLog: (message: string, type?: "info" | "success" | "error") => void;
}

function VideoPlayerComponent({ playbackId, addLog }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isHlsSupported, setIsHlsSupported] = useState(false);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [availableQualities, setAvailableQualities] = useState<Level[]>([]);
  const [videoStats, setVideoStats] = useState({
    buffered: 0,
    currentTime: 0,
    duration: 0,
  });

  const handleError = useCallback(
    (e: Event) => {
      const video = e.target as HTMLVideoElement;
      const error = video.error;

      let errorMessage = "Unknown video error";
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = "Video loading was aborted";
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = "Network error occurred";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = "Video decoding error";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = "Video format not supported by browser";
            break;
          default:
            errorMessage = error.message || "Video playback error";
        }
      }

      addLog(`Video error: ${errorMessage}`, "error");
    },
    [addLog]
  );

  const handleLoadStart = useCallback(() => {
    addLog("Video loading started", "info");
  }, [addLog]);

  const handleCanPlay = useCallback(() => {
    addLog("Video ready to play", "success");
  }, [addLog]);

  const handlePlaying = useCallback(() => {
    addLog("Video started playing!", "success");
  }, [addLog]);

  const handleWaiting = useCallback(() => {
    addLog("Video buffering...", "info");
  }, [addLog]);

  const handleStalled = useCallback(() => {
    addLog("Video stalled - checking connection", "info");
  }, [addLog]);

  const handleLoadedMetadata = useCallback(() => {
    addLog("Video metadata loaded", "info");
    const video = videoRef.current;
    if (video) {
      setVideoStats((prev) => ({
        ...prev,
        duration: video.duration,
      }));
    }
  }, [addLog]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      const buffered =
        video.buffered.length > 0
          ? video.buffered.end(video.buffered.length - 1)
          : 0;
      setVideoStats({
        buffered,
        currentTime: video.currentTime,
        duration: video.duration,
      });
    }
  }, []);

  const handleHlsError = useCallback(
    (event: string, data: ErrorData) => {
      console.error("HLS.js error:", data);

      if (data.fatal) {
        switch (data.type) {
          case ErrorTypes.NETWORK_ERROR:
            addLog("HLS Network error - attempting to recover", "error");
            // Try to recover from network error
            if (hlsRef.current) {
              hlsRef.current.startLoad();
            }
            break;
          case ErrorTypes.MEDIA_ERROR:
            addLog("HLS Media error - stream may not be live", "error");
            // Try to recover from media error
            if (hlsRef.current) {
              hlsRef.current.recoverMediaError();
            }
            break;
          default:
            addLog(`HLS Fatal error: ${data.details}`, "error");
            if (hlsRef.current) {
              hlsRef.current.destroy();
              hlsRef.current = null;
            }
            break;
        }
      } else {
        // Non-fatal errors
        if (data.details === "manifestParsingError") {
          addLog("❌ Stream manifest error - no video data available", "error");
          addLog(
            "💡 This means the stream exists but has no video content",
            "info"
          );
          addLog("🔧 Start streaming in OBS Studio to add video data", "info");
        } else {
          addLog(`HLS Warning: ${data.details}`, "error");
        }
      }
    },
    [addLog]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackId) {
      if (!playbackId) {
        addLog("❌ No playback ID available for video player", "error");
      }
      return;
    }

    const videoSrc = `https://playback.livepeer.studio/hls/${playbackId}/index.m3u8`;
    addLog(`🎬 Loading video from: ${videoSrc}`, "info");

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      setIsHlsSupported(true);
      addLog("✅ Using HLS.js for enhanced video playback", "success");

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
        startLevel: -1,
        capLevelToPlayerSize: true,
        debug: false,
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        addLog(
          `HLS manifest loaded - ${data.levels.length} quality levels available`,
          "success"
        );
        setAvailableQualities(data.levels);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        addLog(`HLS quality switched to level ${data.level}`, "info");
        setCurrentQuality(data.level);
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {});

      hls.on(Hls.Events.ERROR, handleHlsError);

      hls.on(Hls.Events.LEVEL_LOADED, () => {});

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (event, data) => {
        addLog(`Audio track switched to ${data.id}`, "info");
      });

      hls.loadSource(videoSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {});
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      setIsHlsSupported(false);
      addLog("🍎 Using native Safari HLS support", "success");
      video.src = videoSrc;
    } else {
      addLog("❌ Browser doesn't support HLS playback", "error");
      return;
    }

    video.addEventListener("error", handleError);
    video.addEventListener("loadstart", handleLoadStart);
    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("stalled", handleStalled);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);

    return () => {
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadstart", handleLoadStart);
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("stalled", handleStalled);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [
    playbackId,
    handleError,
    handleLoadStart,
    handleCanPlay,
    handlePlaying,
    handleWaiting,
    handleStalled,
    handleLoadedMetadata,
    handleTimeUpdate,
    handleHlsError,
    addLog,
  ]);

  const reloadVideo = useCallback(() => {
    const video = videoRef.current;
    if (video && playbackId) {
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
        hlsRef.current.loadSource(
          `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`
        );
        addLog(" HLS: Reloading stream...", "info");
      } else {
        video.src = `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
        video.load();
        addLog(" Video: Reloading stream...", "info");
      }
    }
  }, [playbackId, addLog]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        video.play().catch((err) => {
          addLog(`Play failed: ${err.message}`, "error");
        });
      } else {
        video.pause();
      }
    }
  }, [addLog]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      addLog(`Video ${video.muted ? "muted" : "unmuted"}`, "info");
    }
  }, [addLog]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        addLog("Exited fullscreen", "info");
      } else {
        video.requestFullscreen().catch((err) => {
          addLog(`Fullscreen failed: ${err.message}`, "error");
        });
        addLog("Entered fullscreen", "info");
      }
    }
  }, [addLog]);

  const getVideoStats = useCallback(() => {
    const video = videoRef.current;
    if (video && hlsRef.current) {
      const currentLevel = hlsRef.current.currentLevel;
      const levels = hlsRef.current.levels;
      const bufferedSeconds =
        video.buffered.length > 0
          ? video.buffered.end(0) - video.currentTime
          : 0;

      addLog(
        ` HLS Stats - Quality: ${currentLevel >= 0 ? levels[currentLevel]?.height + "p" : "Auto"}, Buffer: ${bufferedSeconds.toFixed(1)}s`,
        "info"
      );
    } else if (video) {
      const bufferedSeconds =
        video.buffered.length > 0
          ? video.buffered.end(0) - video.currentTime
          : 0;
      addLog(
        `Video Stats - Buffer: ${bufferedSeconds.toFixed(1)}s, Duration: ${video.duration.toFixed(1)}s`,
        "info"
      );
    }
  }, [addLog]);

  const switchQuality = useCallback(
    (level: number) => {
      if (hlsRef.current) {
        hlsRef.current.currentLevel = level;
        addLog(
          `Switched to quality level ${level === -1 ? "Auto" : level}`,
          "info"
        );
      }
    },
    [addLog]
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        controls
        autoPlay={false}
        muted={true}
        playsInline
        className="w-full aspect-video bg-black"
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450'%3E%3Crect width='800' height='450' fill='%23000'/%3E%3Ctext x='400' y='140' fill='%23fff' text-anchor='middle' font-size='28'%3E📺 HLS.js Enhanced Player%3C/text%3E%3Ctext x='400' y='180' fill='%23888' text-anchor='middle' font-size='18'%3ESupports all modern browsers%3C/text%3E%3Ctext x='400' y='220' fill='%23666' text-anchor='middle' font-size='16'%3EAdaptive quality • Low latency • Error recovery%3C/text%3E%3Ctext x='400' y='260' fill='%23555' text-anchor='middle' font-size='14'%3EStart streaming with OBS to see video%3C/text%3E%3Ctext x='400' y='300' fill='%23444' text-anchor='middle' font-size='12'%3EChrome • Firefox • Edge • Safari supported%3C/text%3E%3C/svg%3E"
      >
        <div className="w-full h-full flex items-center justify-center text-white bg-gray-900">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">X</div>
            <p className="text-lg mb-2">Video playback not supported</p>
            <p className="text-sm text-gray-400 mb-4">
              Please update your browser or try a different one
            </p>
            <p className="text-xs text-gray-500">
              Requires a modern browser with HTML5 video support
            </p>
          </div>
        </div>
      </video>
      <div className="absolute top-4 right-4 flex flex-wrap gap-1">
        <button
          onClick={reloadVideo}
          className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs hover:bg-opacity-80 transition-opacity"
          title="Reload video stream"
        >
          Reload
        </button>

        <button
          onClick={togglePlayPause}
          className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs hover:bg-opacity-80 transition-opacity"
          title="Play or pause video"
        >
          Play/Pause
        </button>

        <button
          onClick={toggleMute}
          className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs hover:bg-opacity-80 transition-opacity"
          title="Toggle mute"
        >
          Mute
        </button>

        <button
          onClick={getVideoStats}
          className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs hover:bg-opacity-80 transition-opacity"
          title="Show video statistics"
        >
          Stats
        </button>

        <button
          onClick={toggleFullscreen}
          className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs hover:bg-opacity-80 transition-opacity"
          title="Toggle fullscreen"
        >
          Full
        </button>
      </div>
      <div className="absolute bottom-4 left-4">
        <div className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs flex items-center space-x-1">
          {isHlsSupported ? (
            <>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              <span className="text-green-400">HLS.js Active</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              <span className="text-blue-400">Native HLS</span>
            </>
          )}
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
        <div className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs">
          {videoStats.duration > 0 && (
            <span>
              {formatTime(videoStats.currentTime)} /{" "}
              {formatTime(videoStats.duration)}
            </span>
          )}
        </div>
      </div>
      {isHlsSupported && availableQualities.length > 0 && (
        <div className="absolute bottom-4 right-4">
          <select
            value={currentQuality}
            onChange={(e) => switchQuality(parseInt(e.target.value))}
            className="bg-black bg-opacity-60 text-white text-xs rounded px-2 py-1 border-0"
            title="Select video quality"
          >
            <option value="-1">Auto Quality</option>
            {availableQualities.map((level: Level, index: number) => (
              <option key={index} value={index}>
                {level.height}p ({Math.round(level.bitrate / 1000)}k)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="absolute top-4 left-4">
        <div className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs">
          Buffer:{" "}
          {(videoStats.buffered - videoStats.currentTime || 0).toFixed(1)}s
        </div>
      </div>
    </div>
  );
}

export default function StreamTestComponent() {
  const [wallet, setWallet] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  // Fix hydration issues by only rendering on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get wallet address from auth context or localStorage
  useEffect(() => {
    if (!isClient) return;

    const getWalletAddress = () => {
      // Try to get from localStorage first
      const storedWallet =
        localStorage.getItem("wallet") ||
        localStorage.getItem("connectedWallet") ||
        sessionStorage.getItem("wallet");

      if (storedWallet) {
        setWallet(storedWallet);
        return;
      }

      // Fallback to a default for testing (you can remove this in production)
      setWallet(
        "0x04fef7247897775ee856f4a2c52b460300b67306c14a200ce71eb1f9190a388e"
      );
    };

    getWalletAddress();
  }, [isClient]);

  // Check for existing stream when wallet is available
  useEffect(() => {
    if (wallet && isClient) {
      getStreamData();
    }
  }, [wallet, isClient]);
  const [streamData, setStreamData] = useState<StreamData>({});
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    "create" | "manage" | "view" | "chat" | "debug"
  >("create");
  const [streamForm, setStreamForm] = useState({
    title: "Test Stream",
    description: "Testing Livepeer integration with HLS.js",
    category: "Technology",
    tags: ["test", "livepeer", "streaming", "hls"],
  });

  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [advancedSettings, setAdvancedSettings] = useState({
    autoPlay: false,
    lowLatency: true,
    recordStream: true,
    enableChat: true,
    maxBitrate: 6000,
    resolution: "1080p",
    enableHls: true,
  });

  const [debugMode, setDebugMode] = useState(false);
  interface ApiCallRecord {
    endpoint: string;
    method: string;
    status: number;
    duration: number;
    timestamp: string;
    success: boolean;
    error: string | null;
  }

  const [apiCallHistory, setApiCallHistory] = useState<ApiCallRecord[]>([]);
  const [autoCheckInterval, setAutoCheckInterval] =
    useState<NodeJS.Timeout | null>(null);

  const addLog = useCallback(
    (message: string, type: "info" | "success" | "error" = "info") => {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
      setLogs((prev) => [...prev, logEntry]);
    },
    []
  );

  const apiCall = async (
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse> => {
    const startTime = Date.now();

    try {
      addLog(`Making API call to ${endpoint}`, "info");

      const response = await fetch(endpoint, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      const data = await response.json();
      const endTime = Date.now();
      const duration = endTime - startTime;

      const callRecord = {
        endpoint,
        method: options.method || "GET",
        status: response.status,
        duration,
        timestamp: new Date().toISOString(),
        success: response.ok,
        error: response.ok ? null : data.error,
      };

      setApiCallHistory((prev) => [...prev.slice(-9), callRecord]);

      if (response.ok) {
        addLog(
          `API call successful (${duration}ms): ${data.message || "Success"}`,
          "success"
        );
        return { success: true, ...data };
      } else {
        addLog(
          `API call failed (${duration}ms): ${data.error || "Unknown error"}`,
          "error"
        );
        return { success: false, error: data.error };
      }
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Network error";

      const callRecord = {
        endpoint,
        method: options.method || "GET",
        status: 0,
        duration,
        timestamp: new Date().toISOString(),
        success: false,
        error: errorMessage,
      };

      setApiCallHistory((prev) => [...prev.slice(-9), callRecord]);
      addLog(`API call error (${duration}ms): ${errorMessage}`, "error");
      return { success: false, error: errorMessage };
    }
  };

  const createStream = async () => {
    if (!wallet) {
      addLog(
        "❌ No wallet address available. Please connect your wallet.",
        "error"
      );
      return;
    }

    setLoading(true);
    const result = await apiCall("/api/streams/create", {
      method: "POST",
      body: JSON.stringify({
        wallet,
        ...streamForm,
        ...advancedSettings,
      }),
    });

    if (result.success && result.streamData) {
      setStreamData(result.streamData);
      addLog(
        "Stream created successfully! Now start streaming in OBS Studio.",
        "success"
      );

      // Show instructions for the new 2-step process
      if (result.instructions) {
        addLog("📋 Next steps:", "info");
        addLog(`1. ${result.instructions.step1}`, "info");
        addLog(`2. ${result.instructions.step2}`, "info");
        addLog(`3. ${result.instructions.step3}`, "info");
        addLog(`4. ${result.instructions.step4}`, "info");
      }
    } else {
      addLog(`❌ ${result.error || "Failed to create stream"}`, "error");
    }
    setLoading(false);
  };

  const startStream = async () => {
    setLoading(true);
    const result = await apiCall("/api/streams/start", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    });

    if (result.success) {
      setStreamData((prev) => ({ ...prev, isLive: true }));
      addLog("Stream started!", "success");
    }
    setLoading(false);
  };

  const stopStream = async () => {
    setLoading(true);
    const result = await apiCall("/api/streams/start", {
      method: "DELETE",
      body: JSON.stringify({ wallet }),
    });

    if (result.success) {
      setStreamData((prev) => ({ ...prev, isLive: false }));
      addLog("Stream stopped!", "success");
    }
    setLoading(false);
  };

  const checkAutoStart = async () => {
    if (!wallet) {
      addLog(
        "❌ No wallet address available. Please connect your wallet.",
        "error"
      );
      return;
    }

    setLoading(true);
    const result = await apiCall("/api/streams/start", {
      method: "POST",
      body: JSON.stringify({ wallet }),
    });

    if (result.success) {
      if (result.autoStarted) {
        setStreamData((prev) => ({ ...prev, isLive: true }));
        addLog(
          "🎉 Stream auto-started! OBS Studio connection detected!",
          "success"
        );
        // Stop auto-checking once stream is live
        if (autoCheckInterval) {
          clearInterval(autoCheckInterval);
          setAutoCheckInterval(null);
        }
      } else if (result.waitingForOBS) {
        addLog("⏳ Waiting for OBS Studio to connect...", "info");
      } else if (result.isLive) {
        setStreamData((prev) => ({ ...prev, isLive: true }));
        addLog("✅ Stream is already live!", "success");
        // Stop auto-checking once stream is live
        if (autoCheckInterval) {
          clearInterval(autoCheckInterval);
          setAutoCheckInterval(null);
        }
      } else if (result.streamKey) {
        addLog(`🔑 Stream key created: ${result.streamKey}`, "success");
        setStreamData((prev) => ({
          ...prev,
          streamKey: result.streamKey,
          streamId: result.streamId,
          playbackId: result.playbackId,
        }));
      }
    } else {
      addLog(`❌ ${result.error || "Failed to check stream status"}`, "error");
    }
    setLoading(false);
  };

  const startAutoCheck = () => {
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
    }

    const interval = setInterval(() => {
      if (streamData.streamId && !streamData.isLive) {
        checkAutoStart();
      }
    }, 5000); // Check every 5 seconds

    setAutoCheckInterval(interval);
    addLog("🔄 Auto-check started - checking every 5 seconds", "info");
  };

  const stopAutoCheck = () => {
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
      setAutoCheckInterval(null);
      addLog("⏹️ Auto-check stopped", "info");
    }
  };

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (autoCheckInterval) {
        clearInterval(autoCheckInterval);
      }
    };
  }, [autoCheckInterval]);

  const getStreamData = async () => {
    setLoading(true);
    const result = await apiCall(`/api/streams/${wallet}`);

    if (result.success && result.streamData) {
      setStreamData(result.streamData || {});
      addLog("Stream data retrieved!", "success");
    }
    setLoading(false);
  };

  const getPlaybackSource = async () => {
    if (!streamData.playbackId) {
      addLog("No playback ID available", "error");
      return;
    }

    setLoading(true);
    const result = await apiCall(
      `/api/streams/playback/${streamData.playbackId}`
    );

    if (result.success) {
      addLog(`Playback source: ${result.src}`, "success");
    }
    setLoading(false);
  };

  const updateStream = async () => {
    setLoading(true);
    const result = await apiCall("/api/streams/update", {
      method: "PATCH",
      body: JSON.stringify({
        wallet,
        title: streamForm.title + " (Updated)",
        description: "Updated description with HLS.js support",
      }),
    });

    if (result.success) {
      addLog("Stream updated!", "success");
    }
    setLoading(false);
  };

  const deleteStream = async () => {
    if (!confirm("Are you sure you want to delete the stream?")) return;

    setLoading(true);
    const result = await apiCall("/api/streams/delete", {
      method: "DELETE",
      body: JSON.stringify({ wallet }),
    });

    if (result.success) {
      setStreamData({});
      addLog("Stream deleted!", "success");
    } else {
      addLog(`❌ ${result.error || "Failed to delete stream"}`, "error");
    }
    setLoading(false);
  };

  const forceDeleteStream = async () => {
    if (
      !confirm(
        "Are you sure you want to FORCE DELETE the stream? This will delete even if it's live!"
      )
    )
      return;

    setLoading(true);
    const result = await apiCall(`/api/streams/delete-get?wallet=${wallet}`, {
      method: "GET",
    });

    if (result.success) {
      setStreamData({});
      addLog("Stream force deleted successfully!", "success");
    } else {
      addLog(`❌ ${result.error || "Failed to force delete stream"}`, "error");
    }
    setLoading(false);
  };

  const getMetrics = async () => {
    if (!streamData.streamId) {
      addLog("No stream ID available", "error");
      return;
    }

    setLoading(true);
    const result = await apiCall(`/api/streams/metrics/${streamData.streamId}`);

    if (result.success && result.metrics) {
      addLog(
        `Metrics retrieved! Current viewers: ${result.metrics.stream?.currentViewers || 0}`,
        "success"
      );
    }
    setLoading(false);
  };

  const sendChatMessage = async () => {
    if (!chatMessage.trim() || !streamData.playbackId) return;

    const result = await apiCall("/api/streams/chat", {
      method: "POST",
      body: JSON.stringify({
        wallet,
        playbackId: streamData.playbackId,
        content: chatMessage,
      }),
    });

    if (result.success && result.chatMessage) {
      const newMessage = result.chatMessage;
      setChatMessages((prev) => [...prev, newMessage]);
      setChatMessage("");
      addLog("Chat message sent!", "success");
    }
  };

  const getChatMessages = async () => {
    if (!streamData.playbackId) return;

    const result = await apiCall(
      `/api/streams/chat?playbackId=${streamData.playbackId}`
    );

    if (result.success && result.messages) {
      setChatMessages(result.messages);
      addLog(`Retrieved ${result.messages.length} chat messages`, "success");
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog("Logs cleared", "info");
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addLog(` ${label} copied to clipboard`, "success");
    } catch {
      addLog(`Failed to copy ${label}`, "error");
    }
  };

  const exportLogs = () => {
    const logData = logs.join("\n");
    const blob = new Blob([logData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stream-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog("Logs exported successfully", "success");
  };

  const testHlsSupport = () => {
    if (Hls.isSupported()) {
      addLog(" HLS.js is supported in this browser", "success");
      addLog(`HLS.js version: ${Hls.version}`, "info");
    } else if (
      document
        .createElement("video")
        .canPlayType("application/vnd.apple.mpegurl")
    ) {
      addLog("Native HLS support detected (Safari)", "success");
    } else {
      addLog(" No HLS support detected", "error");
    }
  };

  const testStreamUrl = async () => {
    if (!streamData.playbackId) {
      addLog("❌ No playback ID available to test", "error");
      return;
    }

    const streamUrl = `https://livepeercdn.studio/hls/${streamData.playbackId}/index.m3u8`;
    addLog(`🔍 Testing stream URL: ${streamUrl}`, "info");

    try {
      const response = await fetch(streamUrl, { method: "HEAD" });
      if (response.ok) {
        addLog("✅ Stream URL is accessible", "success");
      } else {
        addLog(`❌ Stream URL returned status: ${response.status}`, "error");
      }
    } catch (error) {
      addLog(`❌ Stream URL test failed: ${error}`, "error");
    }
  };

  const debugPlaybackIssue = async () => {
    if (!streamData.playbackId) {
      addLog("❌ No playback ID available to debug", "error");
      return;
    }

    addLog(`🔍 Debugging playback issue for: ${streamData.playbackId}`, "info");

    // Test 1: Check if stream exists in database
    try {
      const dbResult = await apiCall(
        `/api/streams/playback/${streamData.playbackId}`,
        {
          method: "GET",
        }
      );

      if (dbResult.success) {
        addLog("✅ Stream found in database", "success");
        if (dbResult.streamInfo) {
          addLog(`📊 Database Info:`, "info");
          addLog(
            `   - Live: ${dbResult.streamInfo.isLive ? "Yes" : "No"}`,
            "info"
          );
          addLog(`   - Title: ${dbResult.streamInfo.title}`, "info");
        }
      } else {
        addLog(`❌ Stream not found in database: ${dbResult.error}`, "error");
      }
    } catch (error) {
      addLog(`❌ Database check failed: ${error}`, "error");
    }

        // Test 2: Check Livepeer directly
    try {
      const livepeerUrl = `https://playback.livepeer.studio/hls/${streamData.playbackId}/index.m3u8`;
      addLog(`🔍 Testing Livepeer URL: ${livepeerUrl}`, "info");
      
      const response = await fetch(livepeerUrl);
      const text = await response.text();
      
      if (response.ok) {
        addLog("✅ Livepeer URL accessible", "success");
        if (text.includes("EXTM3U")) {
          addLog("✅ Valid HLS manifest found", "success");
        } else {
          addLog("⚠️ Response is not a valid HLS manifest", "error");
          addLog(`📄 Response preview: ${text.substring(0, 200)}...`, "info");
        }
      } else {
        addLog(`❌ Livepeer URL failed: ${response.status}`, "error");
        addLog(`📄 Error response: ${text}`, "error");
      }
    } catch (error) {
      addLog(`❌ Livepeer test failed: ${error}`, "error");
    }

    // Test 3: Check if stream is actually live
    try {
      const healthUrl = `https://playback.livepeer.studio/hls/${streamData.playbackId}/index.m3u8`;
      const healthResponse = await fetch(healthUrl);
      const healthText = await healthResponse.text();

      if (healthText.includes("EXT-X-ERROR")) {
        addLog("❌ Stream has error in manifest", "error");
        addLog(`📄 Error details: ${healthText}`, "error");
      } else if (healthText.includes("EXT-X-ENDLIST")) {
        addLog("⚠️ Stream has ended (EXT-X-ENDLIST found)", "error");
      } else if (healthText.includes("EXTINF")) {
        addLog("✅ Stream appears to be live with segments", "success");
      } else {
        addLog("⚠️ Stream manifest is empty or invalid", "error");
        addLog(
          `📄 Manifest preview: ${healthText.substring(0, 200)}...`,
          "info"
        );
      }
    } catch (error) {
      addLog(`❌ Stream health check failed: ${error}`, "error");
    }
  };

  const checkStreamStatus = async () => {
    if (!streamData.playbackId) {
      addLog("❌ No playback ID available to check", "error");
      return;
    }

    addLog(`🔍 Checking stream status for: ${streamData.playbackId}`, "info");

    try {
      const result = await apiCall(
        `/api/streams/playback/${streamData.playbackId}`,
        {
          method: "GET",
        }
      );

      if (result.success) {
        addLog("✅ Stream status check successful", "success");
        if (result.streamInfo) {
          addLog(`📊 Stream Info:`, "info");
          addLog(
            `   - Live: ${result.streamInfo.isLive ? "Yes" : "No"}`,
            "info"
          );
          addLog(`   - Title: ${result.streamInfo.title}`, "info");
          addLog(`   - Viewers: ${result.streamInfo.currentViewers}`, "info");
        }
      } else {
        addLog(`❌ Stream status check failed: ${result.error}`, "error");
      }
    } catch (error) {
      addLog(`❌ Stream status check error: ${error}`, "error");
    }
  };

  const fixStreamAccess = async () => {
    if (!wallet) {
      addLog("❌ No wallet available to fix stream access", "error");
      return;
    }

    addLog(`🔧 Attempting to fix stream access for wallet: ${wallet}`, "info");

    try {
      // First, force delete the existing stream
      addLog("🗑️ Force deleting existing stream...", "info");
      const deleteResult = await apiCall(
        `/api/streams/delete-get?wallet=${wallet}`,
        {
          method: "GET",
        }
      );

      if (deleteResult.success) {
        addLog("✅ Stream deleted successfully", "success");

        // Wait a moment for deletion to complete
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Create a new stream
        addLog("🔄 Creating new stream with proper access...", "info");
        const createResult = await apiCall("/api/streams/start", {
          method: "POST",
          body: JSON.stringify({ wallet }),
        });

        if (createResult.success) {
          addLog("✅ New stream created successfully", "success");
          addLog("📋 Stream Key:", "info");
          addLog(`   ${createResult.streamKey}`, "info");
          addLog("💡 Copy this stream key to OBS Studio", "info");

          // Update local stream data
          setStreamData({
            streamId: createResult.streamId,
            playbackId: createResult.playbackId,
            streamKey: createResult.streamKey,
            isLive: false,
          });
        } else {
          addLog(
            `❌ Failed to create new stream: ${createResult.error}`,
            "error"
          );
        }
      } else {
        addLog(`❌ Failed to delete stream: ${deleteResult.error}`, "error");
      }
    } catch (error) {
      addLog(`❌ Stream access fix failed: ${error}`, "error");
    }
  };

  const clearApiHistory = () => {
    setApiCallHistory([]);
    addLog("API call history cleared", "info");
  };

  // Don't render anything until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading streaming interface...</p>
        </div>
      </div>
    );
  }

  // Check if wallet is available
  if (!wallet) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
            <p className="font-medium">Wallet Not Connected</p>
            <p className="text-sm">
              Please connect your wallet to start streaming.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Livepeer Stream Testing Dashboard
        </h1>
        <p className="text-gray-600">
          Comprehensive testing suite with HLS.js integration for universal
          browser support
        </p>
        <div className="mt-2 text-sm text-gray-500 flex items-center space-x-4">
          <span>HLS.js Enhanced</span>
          <span>Fixed infinite loops</span>
          <span>Complete API testing</span>
          <span>Universal browser support</span>
          <button
            onClick={testHlsSupport}
            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs hover:bg-blue-200 transition-colors"
          >
            Test HLS Support
          </button>
          <button
            onClick={testStreamUrl}
            className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs hover:bg-green-200 transition-colors"
          >
            Test Stream URL
          </button>
          <button
            onClick={checkStreamStatus}
            className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs hover:bg-purple-200 transition-colors"
          >
            Check Stream Status
          </button>
          <button
            onClick={fixStreamAccess}
            className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs hover:bg-orange-200 transition-colors"
          >
            Fix Stream Access
          </button>
          <button
            onClick={debugPlaybackIssue}
            className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs hover:bg-red-200 transition-colors"
          >
            Debug Playback
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-4 rounded-lg mb-6 border">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <span className="text-sm text-gray-500">Status:</span>
            <div
              className={`font-semibold flex items-center ${streamData.isLive ? "text-red-500" : "text-gray-500"}`}
            >
              {streamData.isLive ? "🔴 LIVE" : "⚫ OFFLINE"}
              {streamData.isLive && (
                <span className="ml-2 animate-pulse">●</span>
              )}
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Stream ID:</span>
            <div
              className="font-mono text-xs truncate"
              title={streamData.streamId}
            >
              {streamData.streamId || "Not created"}
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Viewers:</span>
            <div className="font-semibold text-blue-600">
              {streamData.currentViewers || 0}
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Total Views:</span>
            <div className="font-semibold text-green-600">
              {streamData.totalViews || 0}
            </div>
          </div>
          <div>
            <span className="text-sm text-gray-500">HLS Support:</span>
            <div className="font-semibold text-purple-600">
              {isClient
                ? Hls.isSupported()
                  ? "HLS.js"
                  : "Native"
                : "Loading..."}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: "create", label: " Create & Manage", color: "blue" },
            { id: "manage", label: "Stream Controls", color: "green" },
            { id: "view", label: " Playback Test", color: "purple" },
            { id: "chat", label: "Chat Test", color: "pink" },
            { id: "debug", label: "Debug & Analytics", color: "orange" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(
                  tab.id as "create" | "manage" | "view" | "chat" | "debug"
                )
              }
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? `border-${tab.color}-500 text-${tab.color}-600`
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {activeTab === "create" && (
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="text-xl font-semibold mb-4 text-blue-800">
                Stream Creation & Management
              </h3>

              {/* Wallet Address Display */}
              {isClient && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    Connected Wallet:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wallet}
                      onChange={(e) => setWallet(e.target.value)}
                      className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      placeholder="Wallet address will appear here"
                      readOnly
                    />
                    <button
                      onClick={() => {
                        const randomWallet =
                          "0x" + Math.random().toString(16).substr(2, 40);
                        setWallet(randomWallet);
                      }}
                      className="px-4 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
                    >
                      Test Wallet
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Using connected wallet address for streaming. Click "Test
                    Wallet" for testing.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      Stream Title:
                    </label>
                    <input
                      type="text"
                      value={streamForm.title}
                      onChange={(e) =>
                        setStreamForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter stream title"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700">
                      Category:
                    </label>
                    <select
                      value={streamForm.category}
                      onChange={(e) =>
                        setStreamForm((prev) => ({
                          ...prev,
                          category: e.target.value,
                        }))
                      }
                      className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="Technology">Technology</option>
                      <option value="Gaming">Gaming</option>
                      <option value="Music">Music</option>
                      <option value="Education">Education</option>
                      <option value="Entertainment">Entertainment</option>
                      <option value="Sports">Sports</option>
                      <option value="News">News</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    Description:
                  </label>
                  <textarea
                    value={streamForm.description}
                    onChange={(e) =>
                      setStreamForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Enter stream description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700">
                    Tags (comma separated):
                  </label>
                  <input
                    type="text"
                    value={streamForm.tags.join(", ")}
                    onChange={(e) =>
                      setStreamForm((prev) => ({
                        ...prev,
                        tags: e.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }))
                    }
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., gaming, live, tutorial, hls"
                  />
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                    Advanced Settings
                  </summary>
                  <div className="mt-2 p-4 bg-gray-50 rounded-md space-y-3">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={advancedSettings.recordStream}
                            onChange={(e) =>
                              setAdvancedSettings((prev) => ({
                                ...prev,
                                recordStream: e.target.checked,
                              }))
                            }
                            className="rounded"
                          />
                          <span className="text-sm">Record Stream</span>
                        </label>
                      </div>
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={advancedSettings.enableChat}
                            onChange={(e) =>
                              setAdvancedSettings((prev) => ({
                                ...prev,
                                enableChat: e.target.checked,
                              }))
                            }
                            className="rounded"
                          />
                          <span className="text-sm">Enable Chat</span>
                        </label>
                      </div>
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={advancedSettings.lowLatency}
                            onChange={(e) =>
                              setAdvancedSettings((prev) => ({
                                ...prev,
                                lowLatency: e.target.checked,
                              }))
                            }
                            className="rounded"
                          />
                          <span className="text-sm">Low Latency Mode</span>
                        </label>
                      </div>
                      <div>
                        <label className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={advancedSettings.enableHls}
                            onChange={(e) =>
                              setAdvancedSettings((prev) => ({
                                ...prev,
                                enableHls: e.target.checked,
                              }))
                            }
                            className="rounded"
                          />
                          <span className="text-sm">
                            HLS.js Enhanced Player
                          </span>
                        </label>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Max Bitrate:
                        </label>
                        <select
                          value={advancedSettings.maxBitrate}
                          onChange={(e) =>
                            setAdvancedSettings((prev) => ({
                              ...prev,
                              maxBitrate: parseInt(e.target.value),
                            }))
                          }
                          className="w-full p-2 border rounded text-sm"
                        >
                          <option value={3000}>3 Mbps</option>
                          <option value={6000}>6 Mbps</option>
                          <option value={9000}>9 Mbps</option>
                          <option value={12000}>12 Mbps</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Resolution:
                        </label>
                        <select
                          value={advancedSettings.resolution}
                          onChange={(e) =>
                            setAdvancedSettings((prev) => ({
                              ...prev,
                              resolution: e.target.value,
                            }))
                          }
                          className="w-full p-2 border rounded text-sm"
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                          <option value="1440p">1440p</option>
                          <option value="2160p">4K</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </details>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    onClick={createStream}
                    disabled={loading}
                    className="bg-blue-500 text-white px-6 py-3 rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Creating..." : "Create Stream (2-Step)"}
                  </button>

                  <button
                    onClick={getStreamData}
                    disabled={loading}
                    className="bg-gray-500 text-white px-6 py-3 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Loading..." : " Get Data"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={updateStream}
                    disabled={loading || !streamData.streamId}
                    className="bg-yellow-500 text-white px-6 py-3 rounded-md hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Updating..." : " Update"}
                  </button>

                  <button
                    onClick={deleteStream}
                    disabled={
                      loading || !streamData.streamId || streamData.isLive
                    }
                    className="bg-red-500 text-white px-6 py-3 rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Deleting..." : " Delete"}
                  </button>
                </div>

                {/* Force Delete Button - Works even when stream is live */}
                <div className="mt-4">
                  {streamData.streamId ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
                      <p className="text-sm text-yellow-800">
                        ⚠️ Existing stream detected:{" "}
                        <code className="text-xs">{streamData.streamId}</code>
                      </p>
                      <p className="text-xs text-yellow-600 mt-1">
                        You need to delete the existing stream before creating a
                        new one.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                      <p className="text-sm text-blue-800">
                        ℹ️ No existing stream detected
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        You can create a new stream or use force delete if
                        you're getting "User already has an active stream"
                        error.
                      </p>
                    </div>
                  )}
                  <button
                    onClick={forceDeleteStream}
                    disabled={loading || !wallet}
                    className="w-full bg-red-700 text-white px-6 py-3 rounded-md hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border-2 border-red-600"
                  >
                    {loading ? "Force Deleting..." : "🗑️ FORCE DELETE STREAM"}
                  </button>
                  <p className="text-xs text-red-600 mt-1 text-center">
                    ⚠️ This will delete the stream even if it's currently live
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === "manage" && (
            <div className="bg-green-50 p-6 rounded-lg border border-green-200">
              <h3 className="text-xl font-semibold mb-4 text-green-800">
                ⚡ Stream Controls
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={checkAutoStart}
                    disabled={
                      loading || !streamData.streamId || streamData.isLive
                    }
                    className="bg-green-500 text-white px-6 py-3 rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Checking..." : "Check Auto-Start"}
                  </button>

                  <button
                    onClick={stopStream}
                    disabled={loading || !streamData.isLive}
                    className="bg-red-500 text-white px-6 py-3 rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Stopping..." : " Stop Stream"}
                  </button>
                </div>

                <div className="bg-blue-50 p-3 rounded-md border border-blue-200">
                  <h4 className="font-semibold text-sm text-blue-800 mb-2">
                    🚀 New 2-Step Process:
                  </h4>
                  <ol className="text-xs text-blue-700 space-y-1">
                    <li>1. Create stream (✅ Done)</li>
                    <li>2. Start streaming in OBS Studio</li>
                    <li>3. Click "Check Auto-Start" above</li>
                    <li>4. Stream automatically goes live! 🎉</li>
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={startAutoCheck}
                    disabled={
                      loading ||
                      !streamData.streamId ||
                      streamData.isLive ||
                      autoCheckInterval
                    }
                    className="bg-purple-500 text-white px-4 py-2 rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
                  >
                    🔄 Start Auto-Check
                  </button>

                  <button
                    onClick={stopAutoCheck}
                    disabled={loading || !autoCheckInterval}
                    className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
                  >
                    ⏹️ Stop Auto-Check
                  </button>
                </div>

                {/* Force Delete Button in Manage Tab */}
                <div className="mt-4">
                  <button
                    onClick={forceDeleteStream}
                    disabled={loading || !wallet}
                    className="w-full bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors border-2 border-red-600 text-sm"
                  >
                    {loading ? "Force Deleting..." : "🗑️ FORCE DELETE STREAM"}
                  </button>
                  <p className="text-xs text-red-600 mt-1 text-center">
                    ⚠️ Emergency delete - works even when stream is live
                  </p>
                </div>

                {autoCheckInterval && (
                  <div className="bg-green-50 p-2 rounded-md border border-green-200">
                    <p className="text-xs text-green-700">
                      🔄 Auto-checking every 5 seconds...
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={getPlaybackSource}
                    disabled={loading || !streamData.playbackId}
                    className="bg-purple-500 text-white px-6 py-3 rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Loading..." : "Get Playback"}
                  </button>

                  <button
                    onClick={getMetrics}
                    disabled={loading || !streamData.streamId}
                    className="bg-indigo-500 text-white px-6 py-3 rounded-md hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    {loading ? "Loading..." : " Get Metrics"}
                  </button>
                </div>

                {streamData.streamKey && (
                  <div className="mt-6 p-4 bg-yellow-100 rounded-md border border-yellow-300">
                    <h4 className="font-semibold text-sm text-yellow-800 mb-2">
                      🔑 Stream Key (for OBS/Broadcasting Software):
                    </h4>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 text-xs bg-white p-3 rounded border font-mono break-all">
                        {streamData.streamKey}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(streamData.streamKey!, "Stream Key")
                        }
                        className="bg-yellow-500 text-white px-3 py-2 rounded text-sm hover:bg-yellow-600 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="mt-3 p-3 bg-yellow-50 rounded text-sm">
                      <p className="font-medium text-yellow-800">
                        {" "}
                        OBS Setup Instructions:
                      </p>
                      <ol className="list-decimal list-inside mt-1 space-y-1 text-yellow-700">
                        <li>Open OBS Studio → Settings → Stream</li>
                        <li>Service: Custom</li>
                        <li>
                          Server:{" "}
                          <code className="bg-yellow-200 px-1 rounded">
                            rtmp://rtmp.livepeer.com/live
                          </code>
                        </li>
                        <li>Stream Key: Use the key above</li>
                        <li>
                          Video Settings: {advancedSettings.resolution} @{" "}
                          {advancedSettings.maxBitrate / 1000}Mbps
                        </li>
                        <li>Click Apply → OK → Start Streaming</li>
                      </ol>
                    </div>
                  </div>
                )}

                {streamData.playbackId && (
                  <div className="mt-4 p-4 bg-blue-100 rounded-md border border-blue-300">
                    <h4 className="font-semibold text-sm text-blue-800 mb-2">
                      Playback Information:
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-medium">Playback ID:</span>
                        <code className="ml-2 bg-white px-2 py-1 rounded">
                          {streamData.playbackId}
                        </code>
                      </div>
                      <div>
                        <span className="font-medium">Stream Status:</span>
                        <span
                          className={`ml-2 px-2 py-1 rounded text-xs ${
                            streamData.isLive
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {streamData.isLive ? "LIVE" : "OFFLINE"}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">HLS Support:</span>
                        <span
                          className={`ml-2 px-2 py-1 rounded text-xs ${
                            Hls.isSupported()
                              ? "bg-green-100 text-green-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {Hls.isSupported() ? "HLS.js Enhanced" : "Native HLS"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "view" && (
            <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
              <h3 className="text-xl font-semibold mb-4 text-purple-800">
                HLS.js Enhanced Playback Testing
              </h3>

              {streamData.playbackId ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-4 h-4 rounded-full ${
                          streamData.isLive
                            ? "bg-red-500 animate-pulse"
                            : "bg-gray-400"
                        }`}
                      ></div>
                      <span className="font-medium">
                        Status: {streamData.isLive ? "🔴 LIVE" : "⚫ OFFLINE"}
                      </span>
                      {streamData.currentViewers !== undefined && (
                        <span className="text-sm text-gray-600">
                          {streamData.currentViewers} viewers
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {Hls.isSupported() ? " HLS.js Enhanced" : " Native HLS"}
                    </div>
                  </div>

                  {streamData.playbackId ? (
                    <div>
                      <VideoPlayerComponent
                        playbackId={streamData.playbackId}
                        addLog={addLog}
                      />
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-800">
                          💡 <strong>Troubleshooting:</strong> If you see "HLS
                          Network error" or "manifestParsingError", it means the
                          stream exists but isn't live yet. Start streaming in
                          OBS Studio first!
                        </p>
                        <p className="text-sm text-blue-700 mt-2">
                          🔧 <strong>Quick Fix:</strong> If you're getting "not
                          allowed to view this stream" error, click "Fix Stream
                          Access" to recreate the stream with proper
                          permissions.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gray-100 rounded-lg p-8 text-center">
                      <div className="text-gray-500 mb-4">
                        <div className="text-4xl mb-2">📺</div>
                        <h3 className="text-lg font-semibold mb-2">
                          No Stream Available
                        </h3>
                        <p className="text-sm">
                          Create a stream first to see the video player here.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-3 gap-4 text-sm">
                    <div className="p-4 bg-white rounded-lg border">
                      <h4 className="font-semibold mb-2"> Stream Details</h4>
                      <div className="space-y-1">
                        <p>
                          <strong>Playback ID:</strong>
                        </p>
                        <code className="text-xs bg-gray-100 p-2 rounded block break-all">
                          {streamData.playbackId}
                        </code>
                        <p>
                          <strong>Title:</strong>{" "}
                          {streamData.title || "Untitled Stream"}
                        </p>
                        <p>
                          <strong>Status:</strong>{" "}
                          {streamData.isLive ? "🔴 Live" : "⚫ Offline"}
                        </p>
                        <p>
                          <strong>Category:</strong> {streamForm.category}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-lg border">
                      <h4 className="font-semibold mb-2">Analytics</h4>
                      <div className="space-y-1">
                        <p>
                          <strong>Current Viewers:</strong>{" "}
                          {streamData.currentViewers || 0}
                        </p>
                        <p>
                          <strong>Total Views:</strong>{" "}
                          {streamData.totalViews || 0}
                        </p>
                        <p>
                          <strong>Stream ID:</strong>
                        </p>
                        <code className="text-xs bg-gray-100 p-1 rounded block truncate">
                          {streamData.streamId || "N/A"}
                        </code>
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-lg border">
                      <h4 className="font-semibold mb-2"> Player Info</h4>
                      <div className="space-y-1">
                        <p>
                          <strong>Player Type:</strong>{" "}
                          {Hls.isSupported() ? "HLS.js" : "Native"}
                        </p>
                        <p>
                          <strong>Version:</strong>{" "}
                          {Hls.isSupported() ? Hls.version : "Browser"}
                        </p>
                        <p>
                          <strong>Quality:</strong> Adaptive
                        </p>
                        <p>
                          <strong>Latency:</strong>{" "}
                          {advancedSettings.lowLatency ? "Low" : "Standard"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="font-semibold mb-3 text-blue-800">
                        HLS Stream URL
                      </h4>
                      <div className="flex items-center space-x-2 mb-2">
                        <input
                          type="text"
                          value={`https://livepeercdn.studio/hls/${streamData.playbackId}/index.m3u8`}
                          readOnly
                          className="flex-1 p-2 border rounded text-xs font-mono bg-white"
                        />
                        <button
                          onClick={() =>
                            copyToClipboard(
                              `https://livepeercdn.studio/hls/${streamData.playbackId}/index.m3u8`,
                              "HLS URL"
                            )
                          }
                          className="bg-blue-500 text-white px-3 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-blue-600">
                        Works in: All browsers with HLS.js, Safari natively,
                        VLC, OBS
                      </p>
                    </div>

                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="font-semibold mb-3 text-green-800">
                        External Testing
                      </h4>
                      <div className="space-y-2">
                        <a
                          href={`https://livepeercdn.studio/hls/${streamData.playbackId}/index.m3u8`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors text-sm"
                        >
                          Open in New Tab
                        </a>
                        <button
                          onClick={() => {
                            const url = `https://www.hlsplayer.net/?src=${encodeURIComponent(`https://livepeercdn.studio/hls/${streamData.playbackId}/index.m3u8`)}`;
                            window.open(url, "_blank");
                          }}
                          className="block bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors text-sm"
                        >
                          Test in HLS Player
                        </button>
                      </div>
                      <p className="text-xs text-green-600 mt-2">
                        Test with external HLS players
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <h4 className="font-semibold text-yellow-800 mb-3">
                      Enhanced Testing Guide
                    </h4>
                    <div className="text-sm text-yellow-700 space-y-3">
                      <div>
                        <strong>VLC Media Player:</strong>
                        <ol className="list-decimal list-inside ml-4 space-y-1 mt-1">
                          <li>
                            Open VLC → Media → Open Network Stream (Ctrl+N)
                          </li>
                          <li>Paste HLS URL above</li>
                          <li>
                            Click Play → Should work with HLS.js quality
                            selection
                          </li>
                        </ol>
                      </div>

                      <div>
                        <strong>OBS Studio (Broadcasting Setup):</strong>
                        <ol className="list-decimal list-inside ml-4 space-y-1 mt-1">
                          <li>Settings → Stream → Service: Custom</li>
                          <li>
                            Server:{" "}
                            <code className="bg-yellow-100 px-1 rounded">
                              rtmp://rtmp.livepeer.com/live
                            </code>
                          </li>
                          <li>
                            Stream Key:{" "}
                            <code className="bg-yellow-100 px-1 rounded">
                              {streamData.streamKey ||
                                "Get from Stream Controls"}
                            </code>
                          </li>
                          <li>
                            Video Settings: {advancedSettings.resolution} @{" "}
                            {advancedSettings.maxBitrate / 1000}Mbps
                          </li>
                          <li>Audio Settings: 44.1kHz, 128kbps</li>
                          <li>
                            Start Streaming → HLS.js will auto-adapt quality
                          </li>
                        </ol>
                      </div>

                      <div className="p-3 bg-yellow-100 rounded">
                        <strong> HLS.js Enhanced Features:</strong>
                        <ul className="list-disc list-inside ml-4 space-y-1 mt-1">
                          <li>
                            Automatic quality adaptation based on bandwidth
                          </li>
                          <li>Error recovery for network issues</li>
                          <li>Manual quality selection dropdown</li>
                          <li>Low latency mode for real-time streaming</li>
                          <li>Buffer optimization for smooth playback</li>
                          <li>
                            Universal browser support (Chrome, Firefox, Edge,
                            Safari)
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-100 rounded text-xs text-gray-600 border">
                    <strong> Enhanced Browser Compatibility:</strong>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      <div className="flex items-center space-x-1">
                        <span></span>
                        <span>Chrome: HLS.js Enhanced</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span></span>
                        <span>Firefox: HLS.js Enhanced</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span></span>
                        <span>Edge: HLS.js Enhanced</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span></span>
                        <span>Safari: Native + HLS.js</span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs">
                      All browsers now support adaptive quality, error recovery,
                      and manual quality selection
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-6xl mb-4"></div>
                  <p className="text-xl mb-2">
                    No stream available for HLS.js testing
                  </p>
                  <p className="text-sm mb-4">
                    Create a stream first to test the enhanced playback
                    functionality
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => setActiveTab("create")}
                      className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors mr-2"
                    >
                      Go to Create Stream
                    </button>
                    <button
                      onClick={testHlsSupport}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                    >
                      Test HLS.js Support
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "chat" && (
            <div className="bg-pink-50 p-6 rounded-lg border border-pink-200">
              <h3 className="text-xl font-semibold mb-4 text-pink-800">
                Live Chat Testing
              </h3>

              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
                    className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="Type a chat message..."
                    disabled={!streamData.playbackId}
                    maxLength={500}
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!chatMessage.trim() || !streamData.playbackId}
                    className="bg-pink-500 text-white px-6 py-3 rounded-md hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    Send
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={getChatMessages}
                    disabled={!streamData.playbackId}
                    className="bg-gray-500 text-white px-6 py-3 rounded-md hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    Refresh Messages
                  </button>
                  <button
                    onClick={() => setChatMessages([])}
                    disabled={chatMessages.length === 0}
                    className="bg-red-500 text-white px-6 py-3 rounded-md hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    Clear Chat
                  </button>
                </div>

                <div className="bg-white border border-gray-300 rounded-md h-48 overflow-y-auto p-4">
                  {chatMessages.length > 0 ? (
                    <div className="space-y-2">
                      {chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className="text-sm p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <strong className="text-blue-600">
                                {msg.user?.username}:
                              </strong>
                              <span className="ml-2">{msg.content}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(msg.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <div className="text-3xl mb-2"></div>
                        <p className="text-sm">No chat messages yet</p>
                        <p className="text-xs mt-1">
                          Send a message to test the real-time chat system
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
                  <strong>Chat Stats:</strong> {chatMessages.length} messages •
                  {streamData.playbackId
                    ? " Ready for real-time chat"
                    : " Waiting for stream"}
                </div>

                {!streamData.playbackId && (
                  <div className="p-4 bg-orange-100 rounded-md border border-orange-300">
                    <p className="text-sm text-orange-800">
                      Chat requires an active stream. Create a stream first to
                      test chat functionality.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "debug" && (
            <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
              <h3 className="text-xl font-semibold mb-4 text-orange-800">
                Debug & Analytics
              </h3>

              <div className="space-y-6">
                <div className="p-4 bg-white rounded-lg border">
                  <h4 className="font-semibold mb-2">
                    {" "}
                    HLS.js Debug Information
                  </h4>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p>
                        <strong>HLS.js Supported:</strong>{" "}
                        {Hls.isSupported() ? " Yes" : " No"}
                      </p>
                      <p>
                        <strong>Version:</strong>{" "}
                        {Hls.isSupported() ? Hls.version : "N/A"}
                      </p>
                      <p>
                        <strong>Worker Support:</strong>{" "}
                        {typeof Worker !== "undefined" ? " Yes" : "No"}
                      </p>
                    </div>
                    <div>
                      <p>
                        <strong>Browser:</strong>{" "}
                        {navigator.userAgent.split(" ").slice(-1)[0]}
                      </p>
                      <p>
                        <strong>Platform:</strong> {navigator.platform}
                      </p>
                      <p>
                        <strong>Online:</strong>{" "}
                        {navigator.onLine ? "Yes" : " No"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={testHlsSupport}
                    className="mt-2 bg-orange-500 text-white px-4 py-2 rounded text-sm hover:bg-orange-600 transition-colors"
                  >
                    Test HLS Support
                  </button>
                </div>

                <div className="p-4 bg-white rounded-lg border">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-semibold">Recent API Calls</h4>
                    <button
                      onClick={clearApiHistory}
                      className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      Clear History
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {apiCallHistory.length > 0 ? (
                      apiCallHistory
                        .slice(-5)
                        .reverse()
                        .map((call, idx) => (
                          <div
                            key={idx}
                            className="text-xs p-2 bg-gray-50 rounded"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-mono">
                                {call.method} {call.endpoint}
                              </span>
                              <span
                                className={`px-2 py-1 rounded ${
                                  call.success
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {call.status}
                              </span>
                            </div>
                            <div className="text-gray-600 mt-1">
                              {call.duration}ms •{" "}
                              {new Date(call.timestamp).toLocaleTimeString()}
                              {call.error && (
                                <span className="text-red-600">
                                  {" "}
                                  • {call.error}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-gray-500">No API calls yet</p>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border">
                  <h4 className="font-semibold mb-2">Current Configuration</h4>
                  <div className="text-sm space-y-1">
                    <p>
                      <strong>Low Latency:</strong>{" "}
                      {advancedSettings.lowLatency ? "Enabled" : "Disabled"}
                    </p>
                    <p>
                      <strong>Recording:</strong>{" "}
                      {advancedSettings.recordStream ? " Enabled" : " Disabled"}
                    </p>
                    <p>
                      <strong>Max Bitrate:</strong>{" "}
                      {advancedSettings.maxBitrate / 1000}Mbps
                    </p>
                    <p>
                      <strong>Resolution:</strong> {advancedSettings.resolution}
                    </p>
                    <p>
                      <strong>HLS Enhanced:</strong>{" "}
                      {advancedSettings.enableHls ? "Enabled" : " Disabled"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDebugMode(!debugMode)}
                    className={`px-4 py-2 rounded font-medium transition-colors ${
                      debugMode
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-gray-500 text-white hover:bg-gray-600"
                    }`}
                  >
                    {debugMode ? "Disable Debug" : "Enable Debug"}
                  </button>
                  <button
                    onClick={() => {
                      const config = {
                        streamData,
                        advancedSettings,
                        hlsSupported: Hls.isSupported(),
                        timestamp: new Date().toISOString(),
                      };
                      copyToClipboard(
                        JSON.stringify(config, null, 2),
                        "Debug Config"
                      );
                    }}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                  >
                    Copy Debug Info
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border h-fit">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold"> Enhanced API Logs</h3>
            <div className="flex space-x-2">
              <button
                onClick={exportLogs}
                className="text-xs bg-blue-200 hover:bg-blue-300 px-2 py-1 rounded-md transition-colors"
                title="Export logs to file"
              >
                Export
              </button>
              <button
                onClick={clearLogs}
                className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded-md transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="bg-black text-green-400 p-3 rounded-md h-96 overflow-y-auto font-mono text-xs">
            {logs.length > 0 ? (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`mb-1 ${
                    log.includes("ERROR")
                      ? "text-red-400"
                      : log.includes("SUCCESS")
                        ? "text-green-400"
                        : log.includes("INFO")
                          ? "text-blue-400"
                          : log.includes("HLS")
                            ? "text-purple-400"
                            : "text-gray-400"
                  }`}
                >
                  {log}
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-center mt-8">
                <div className="text-2xl mb-2">X</div>
                <div>No logs yet...</div>
                <div className="text-xs mt-1">
                  Start testing to see enhanced API logs!
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-white rounded-md border text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <strong>Total Logs:</strong> {logs.length}
              </div>
              <div>
                <strong>Successes:</strong>
                <span className="text-green-600 ml-1">
                  {logs.filter((log) => log.includes("SUCCESS")).length}
                </span>
              </div>
              <div>
                <strong>Errors:</strong>
                <span className="text-red-600 ml-1">
                  {logs.filter((log) => log.includes("ERROR")).length}
                </span>
              </div>
              <div>
                <strong>HLS Events:</strong>
                <span className="text-purple-600 ml-1">
                  {logs.filter((log) => log.includes("HLS")).length}
                </span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t text-xs text-gray-600">
              <div>API Calls: {apiCallHistory.length}</div>
              <div>Debug Mode: {debugMode ? " ON" : " OFF"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gradient-to-r from-gray-100 to-blue-100 rounded-lg text-sm text-gray-600 border">
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <p>
              <strong> Test Wallet:</strong>
            </p>
            <code className="text-xs bg-white p-1 rounded break-all">
              {wallet}
            </code>
          </div>
          <div>
            <p>
              <strong>API Base:</strong> <code>/api/streams/*</code>
            </p>
            <p>
              <strong>Status:</strong>{" "}
              {logs.filter((log) => log.includes("SUCCESS")).length} successful
              calls
            </p>
          </div>
          <div>
            <p>
              <strong> Stream Status:</strong>{" "}
              {streamData.isLive ? "Live" : "Offline"}
            </p>
            <p>
              <strong> Stream ID:</strong>{" "}
              {streamData.streamId ? "Active" : "None"}
            </p>
          </div>
          <div>
            <p>
              <strong> HLS Support:</strong>{" "}
              {Hls.isSupported() ? "Enhanced" : "Native"}
            </p>
            <p>
              <strong> Version:</strong>{" "}
              {Hls.isSupported() ? Hls.version : "Browser"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
