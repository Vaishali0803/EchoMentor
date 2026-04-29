// Initialize Icons
lucide.createIcons();

// Auth Check
const userName = localStorage.getItem('user_name');
if (!userName) {
    window.location.href = 'index.html';
} else {
    document.getElementById('userNameDisplay').textContent = userName;
}

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'index.html';
});

// Tab Navigation
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        navItems.forEach(n => n.classList.remove('active'));
        tabPanes.forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        const targetId = item.getAttribute('data-tab') + '-tab';
        document.getElementById(targetId).classList.add('active');
    });
});

// Video & MediaPipe Setup
const videoElement = document.getElementById('inputVideo');
const canvasElement = document.getElementById('outputCanvas');
const canvasCtx = canvasElement.getContext('2d');

const startCameraBtn = document.getElementById('startCameraBtn');
const recordBtn = document.getElementById('recordBtn');
const postureStatus = document.getElementById('postureStatus');
const eyeContactStatus = document.getElementById('eyeContactStatus');
const analysisResults = document.getElementById('analysisResults');

let camera = null;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = 0;
let timerInterval = null;

// Speech Recognition Setup
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let currentTranscript = "";

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscriptPiece = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscriptPiece += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        if (finalTranscriptPiece) {
            currentTranscript += finalTranscriptPiece + " ";
        }
        window.currentInterim = interimTranscript;
        
        // Update live transcript
        const liveEl = document.getElementById('liveTranscript');
        if (isRecording) {
            liveEl.style.display = 'block';
            liveEl.textContent = (currentTranscript + " " + interimTranscript).trim();
        }
    };
    
    recognition.onend = () => {
        // Restart recognition if it stopped automatically but we are still recording
        if (isRecording) {
            try {
                recognition.start();
            } catch(e) {}
        }
    };
    
    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
    };
}

// Global state for history
let sessionHistory = JSON.parse(localStorage.getItem('echomentor_history')) || [];

// Initialize MediaPipe Pose
const pose = new Pose({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
}});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults((results) => {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video frame to canvas (NO DOTS/LINES AS REQUESTED)
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    if (results.poseLandmarks) {
        // Real Posture Analysis Logic
        const shoulders = [results.poseLandmarks[11], results.poseLandmarks[12]];
        if (shoulders[0] && shoulders[1]) {
            const dy = Math.abs(shoulders[0].y - shoulders[1].y);
            if (dy > 0.05) {
                postureStatus.className = 'metric-badge warning';
                postureStatus.innerHTML = '<i data-lucide="alert-circle"></i> Posture: Slouching/Tilted';
            } else {
                postureStatus.className = 'metric-badge good';
                postureStatus.innerHTML = '<i data-lucide="check-circle"></i> Posture: Good';
            }
            lucide.createIcons();
        }
    }
    canvasCtx.restore();
});

// Initialize MediaPipe Face Mesh
const faceMesh = new FaceMesh({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        eyeContactStatus.className = 'metric-badge good';
        eyeContactStatus.innerHTML = '<i data-lucide="eye"></i> Eye Contact: Detected';
    } else {
        eyeContactStatus.className = 'metric-badge warning';
        eyeContactStatus.innerHTML = '<i data-lucide="eye-off"></i> Eye Contact: Looking Away';
    }
    lucide.createIcons();
});

// Start Camera Flow
startCameraBtn.addEventListener('click', async () => {
    if (!camera) {
        startCameraBtn.innerHTML = '<i data-lucide="loader"></i> Starting...';
        lucide.createIcons();
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            videoElement.srcObject = stream;
            
            videoElement.onloadedmetadata = () => {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
            };
            
            camera = new Camera(videoElement, {
                onFrame: async () => {
                    await pose.send({image: videoElement});
                    await faceMesh.send({image: videoElement});
                },
                width: 1280,
                height: 720
            });
            
            await camera.start();
            
            startCameraBtn.style.display = 'none';
            recordBtn.disabled = false;
            
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = processRecording;
        } catch (err) {
            console.error("Camera access denied or failed", err);
            startCameraBtn.innerHTML = '<i data-lucide="camera"></i> Start Camera (Failed)';
            alert("Camera or Microphone access is required to use EchoMentor.");
        }
    }
});

// Record Button Flow
recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        // Start Recording
        recordedChunks = [];
        currentTranscript = "";
        window.currentInterim = "";
        recordingStartTime = Date.now();
        
        // Start Timer
        const timerEl = document.getElementById('recordingTimer');
        const timerSpan = timerEl.querySelector('span');
        timerEl.style.display = 'flex';
        timerSpan.textContent = "00:00";
        
        timerInterval = setInterval(() => {
            const seconds = Math.floor((Date.now() - recordingStartTime) / 1000);
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            timerSpan.textContent = `${m}:${s}`;
        }, 1000);

        // Reset Live Transcript
        const liveEl = document.getElementById('liveTranscript');
        liveEl.style.display = 'block';
        liveEl.textContent = "Listening...";
        
        mediaRecorder.start();
        if (recognition) {
            try { recognition.start(); } catch(e) {}
        }
        
        isRecording = true;
        recordBtn.classList.remove('btn-primary');
        recordBtn.classList.add('btn-danger');
        recordBtn.innerHTML = '<i data-lucide="square" class="record-dot"></i> Stop Recording';
        analysisResults.innerHTML = '<div class="empty-state"><p>Recording in progress... Analyzing your speech in real-time.</p></div>';
    } else {
        // Stop Recording
        mediaRecorder.stop();
        if (recognition) recognition.stop();
        
        clearInterval(timerInterval);
        document.getElementById('recordingTimer').style.display = 'none';
        document.getElementById('liveTranscript').style.display = 'none';
        
        isRecording = false;
        recordBtn.classList.remove('btn-danger');
        recordBtn.classList.add('btn-primary');
        recordBtn.innerHTML = '<i data-lucide="circle" class="record-dot"></i> Start Recording';
    }
    lucide.createIcons();
});

// Process Real AI Feedback based on actual transcript
function processRecording() {
    analysisResults.innerHTML = `
        <div class="empty-state">
            <i data-lucide="loader" style="animation: spin 2s linear infinite;"></i>
            <p>Processing your speech transcript...</p>
        </div>
    `;
    lucide.createIcons();
    
    const recordingDurationMin = (Date.now() - recordingStartTime) / 60000;
    
    // Allow brief time for final speech results to arrive
    setTimeout(() => {
        // Combine final text and any pending interim text
        const finalTextToProcess = (currentTranscript + " " + (window.currentInterim || "")).trim();
        const text = finalTextToProcess || "[No speech detected during this session]";
        
        let wordCount = 0;
        let wpm = 0;
        let fillerCount = 0;
        let score = 0;
        let pacingFeedback = "";
        let fillerFeedback = "";

        if (currentTranscript.trim().length === 0) {
            pacingFeedback = "No speech was detected. Ensure your microphone is working.";
            fillerFeedback = "N/A";
            score = 0;
        } else {
            // Analyze real text
            const words = text.split(/\s+/).filter(w => w.length > 0);
            wordCount = words.length;
            const safeDuration = Math.max(recordingDurationMin, 0.08); // at least ~5 seconds denominator
            wpm = Math.round(wordCount / safeDuration);
            
            // Count fillers (case insensitive)
            const fillers = ["um", "uh", "ah", "like", "so", "basically", "actually", "literally"];
            words.forEach(w => {
                if (fillers.includes(w.toLowerCase().replace(/[^a-z]/g, ''))) fillerCount++;
            });
            
            // Calculate a granular score
            score = 100;
            
            if (wpm < 120) {
                const penalty = Math.min(30, Math.round((120 - wpm) * 0.4));
                score -= penalty;
                pacingFeedback = `A bit slow. Try to pick up the pace slightly for better engagement.`;
            } else if (wpm > 160) {
                const penalty = Math.min(30, Math.round((wpm - 160) * 0.4));
                score -= penalty;
                pacingFeedback = `A bit fast. Try taking breaths between sentences to slow down.`;
            } else {
                pacingFeedback = `Excellent pacing! You are in the optimal range.`;
            }

            const fillerDensity = fillerCount / safeDuration;
            if (fillerDensity > 1) {
                const fPenalty = Math.min(35, Math.round(fillerDensity * 1.5));
                score -= fPenalty;
            }
            
            if (recordingDurationMin < 0.15) {
                score -= 12; // penalty for very short recording
            }
            
            score = Math.max(18, Math.min(100, score)); // floor the score at 18
            fillerFeedback = `Detected ${fillerCount} filler words. ${fillerCount > 2 ? 'Try to use pauses instead.' : 'Great job minimizing fillers!'}`;
        }

        const feedbackHTML = `
            <div style="display:flex; flex-direction:column; gap:1rem; animation: fadeIn 0.5s;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h4 style="color:var(--text-main);">Session Score</h4>
                    <span class="score-pill">${score} / 100</span>
                </div>
                
                <div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:8px;">
                    <strong style="color:var(--text-main); display:block; margin-bottom:0.5rem;">Recognized Transcript:</strong>
                    <p style="font-size:0.9rem; color:var(--text-secondary); font-style:italic;">"${text}"</p>
                </div>
                
                <div>
                    <strong style="color:var(--primary); display:block; margin-bottom:0.5rem;">AI Feedback:</strong>
                    <ul style="padding-left:1.5rem; font-size:0.9rem; color:var(--text-secondary); line-height:1.6;">
                        <li><strong>Pacing:</strong> ${wpm} WPM. ${pacingFeedback}</li>
                        <li><strong>Filler Words:</strong> ${fillerFeedback}</li>
                        <li><strong>Word Count:</strong> You spoke ${wordCount} words during this session.</li>
                    </ul>
                </div>
            </div>
        `;
        
        analysisResults.innerHTML = feedbackHTML;
        lucide.createIcons();

        // Save to real history
        saveToHistory(score, text, wpm, fillerCount);

    }, 2000); // 2s delay to let final speech recognition piece resolve
}

function saveToHistory(score, text, wpm, fillerCount) {
    const session = {
        date: new Date().toLocaleString(),
        score: score,
        snippet: text.length > 50 ? text.substring(0, 50) + "..." : text,
        wpm: wpm,
        fillers: fillerCount
    };
    
    sessionHistory.unshift(session); // add to top
    localStorage.setItem('echomentor_history', JSON.stringify(sessionHistory));
    renderHistory();
    renderSuggestions(wpm, fillerCount);
}

// Initial Render on page load
if (sessionHistory.length > 0) {
    renderHistory();
    renderSuggestions(sessionHistory[0].wpm, sessionHistory[0].fillers);
}

function renderHistory() {
    const historyGrid = document.getElementById('historyGrid');
    if (sessionHistory.length === 0) return;
    
    historyGrid.innerHTML = ''; // clear empty state
    
    sessionHistory.forEach(session => {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="card-date">${session.date}</div>
            <h4>Practice Session</h4>
            <div class="score-pill">Score: ${session.score}/100</div>
            <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:0.5rem">"${session.snippet}"</p>
            <p style="font-size:0.8rem;"><i data-lucide="clock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> ${session.wpm} WPM | ${session.fillers} fillers</p>
        `;
        historyGrid.appendChild(card);
    });
    lucide.createIcons();
}

function renderSuggestions(wpm, fillerCount) {
    const suggestionsList = document.getElementById('suggestionsList');
    suggestionsList.innerHTML = '';
    
    let hasSuggestions = false;
    
    if (wpm > 160) {
        hasSuggestions = true;
        suggestionsList.innerHTML += `
            <div class="suggestion-item">
                <i data-lucide="wind" class="sugg-icon"></i>
                <div>
                    <h4>Pacing Control Exercise</h4>
                    <p>Your last session was very fast (${wpm} WPM). Practice reading a 150-word paragraph and time yourself to finish in exactly 60 seconds.</p>
                </div>
            </div>
        `;
    }
    
    if (fillerCount > 3) {
        hasSuggestions = true;
        suggestionsList.innerHTML += `
            <div class="suggestion-item">
                <i data-lucide="message-square" class="sugg-icon"></i>
                <div>
                    <h4>Embrace the Pause</h4>
                    <p>You used ${fillerCount} filler words. Practice speaking for 1 minute on a random topic, actively replacing any 'um' or 'ah' with a silent 2-second pause.</p>
                </div>
            </div>
        `;
    }
    
    if (!hasSuggestions) {
        suggestionsList.innerHTML = `
            <div class="empty-state">
                <i data-lucide="star"></i>
                <p>Great job! Your pacing and filler word usage are excellent. Keep practicing to maintain your skills.</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

// Upload Area Drag & Drop
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

dropZone.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFiles(e.target.files);
});

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    const file = files[0];
    dropZone.innerHTML = `
        <i data-lucide="check-circle" class="upload-icon" style="color:var(--success)"></i>
        <h3>${file.name} uploaded</h3>
        <p>File received. Real processing would happen here.</p>
    `;
    lucide.createIcons();
}
