import fs from "node:fs";

const filePath = "public/jarvis-casa.html";
let source = fs.readFileSync(filePath, "utf8");
const original = source;

if (!source.includes(".voice-hint{")) {
  source = source.replace(
    ".conversation{",
    ".voice-hint{margin:8px 0 2px;border:1px solid #6b5224;background:#1a1206;color:#ffd776;border-radius:999px;padding:8px 13px;font-size:11px;font-weight:850;letter-spacing:.2px;box-shadow:0 0 22px #ffad1f22}.voice-hint.active{color:#7af0b5;border-color:#2f7658;background:#071b13}.conversation{",
  );
}

source = source.replace(
  '<div id="stage" class="jarvis-stage">',
  '<div id="stage" class="jarvis-stage" role="button" tabindex="0" aria-label="Attiva la voce di Jarvis" onclick="enableVoice(true)" onkeydown="if(event.key===\'Enter\'||event.key===\' \')enableVoice(true)">',
);

if (!source.includes('id="voiceHint"')) {
  source = source.replace(
    '<div id="stateLabel" class="state-label">In attesa</div>',
    '<div id="stateLabel" class="state-label">In attesa</div><button id="voiceHint" class="voice-hint" onclick="enableVoice(true)">🔊 Tocca una volta per attivare Jarvis</button>',
  );
}

const oldSpeech = "function speak(text){if(!('speechSynthesis'in window)){stage('');return}speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang='it-IT';u.rate=.96;u.pitch=.88;u.onstart=()=>stage('speaking');u.onend=()=>stage('');speechSynthesis.speak(u)}";
const newSpeech = `let voiceUnlocked=false,jarvisVoice=null;
function loadJarvisVoices(){if(!('speechSynthesis'in window))return;let voices=speechSynthesis.getVoices();jarvisVoice=voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith('it')&&/luca|cosimo|diego|male|ital/i.test(v.name))||voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith('it'))||null}
if('speechSynthesis'in window){loadJarvisVoices();speechSynthesis.addEventListener?.('voiceschanged',loadJarvisVoices)}
function enableVoice(greet=true){let hint=document.getElementById('voiceHint');if(!('speechSynthesis'in window)){if(hint)hint.textContent='Voce non disponibile qui: apri la pagina in Safari';addMsg('Per sentirmi, apri questa pagina direttamente in Safari. Il browser interno può bloccare la voce.','ai');return false}voiceUnlocked=true;speechSynthesis.cancel();speechSynthesis.resume();loadJarvisVoices();if(hint){hint.textContent='🎙️ Jarvis attivo';hint.classList.add('active')}if(greet)speak('Buonasera Daniele. Voce attivata. Sono pronto.',true);return true}
function speak(text,force=false){if(!('speechSynthesis'in window)){stage('');return}if(!voiceUnlocked&&!force){let hint=document.getElementById('voiceHint');if(hint)hint.textContent='🔊 Tocca una volta per attivare Jarvis';stage('');return}speechSynthesis.cancel();speechSynthesis.resume();let u=new SpeechSynthesisUtterance(text);u.lang='it-IT';u.rate=.93;u.pitch=.82;u.volume=1;if(jarvisVoice)u.voice=jarvisVoice;u.onstart=()=>stage('speaking');u.onend=()=>stage('');u.onerror=()=>{stage('');let hint=document.getElementById('voiceHint');if(hint)hint.textContent='Apri in Safari e tocca di nuovo per la voce'};speechSynthesis.speak(u)}`;
if (source.includes(oldSpeech)) {
  source = source.replace(oldSpeech, newSpeech);
}

source = source.replace(
  "function quick(text){q.value=text;run()}",
  "function quick(text){enableVoice(false);q.value=text;run()}",
);
source = source.replace(
  "function run(){let raw=q.value.trim();",
  "function run(){enableVoice(false);let raw=q.value.trim();",
);
source = source.replace(
  "function listen(){let R=window.SpeechRecognition||window.webkitSpeechRecognition;",
  "function listen(){enableVoice(false);let R=window.SpeechRecognition||window.webkitSpeechRecognition;",
);

if (!source.includes("window.__jarvisContinuousInstalled")) {
  const continuousCode = `
(function installJarvisContinuousListening(){
  if(window.__jarvisContinuousInstalled)return;
  window.__jarvisContinuousInstalled=true;

  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const preferenceKey='jarvis-continuous-mic';
  const baseEnable=typeof window.enableVoice==='function'?window.enableVoice.bind(window):null;
  const baseSpeak=typeof window.speak==='function'?window.speak.bind(window):null;

  let enabled=localStorage.getItem(preferenceKey)==='1';
  let recognition=null;
  let recognitionRunning=false;
  let jarvisSpeaking=false;
  let permissionBlocked=false;
  let retryTimer=null;
  let lastTranscript='';
  let lastTranscriptAt=0;

  function updateHint(text,active){
    const hint=document.getElementById('voiceHint');
    if(!hint)return;
    hint.textContent=text;
    hint.classList.toggle('active',!!active);
  }

  function setStage(mode){
    if(typeof window.stage==='function')window.stage(mode||'');
  }

  function clearRetry(){
    if(retryTimer)clearTimeout(retryTimer);
    retryTimer=null;
  }

  function stopListening(){
    clearRetry();
    const current=recognition;
    recognition=null;
    recognitionRunning=false;
    if(!current)return;
    current.onend=null;
    current.onerror=null;
    current.onresult=null;
    try{current.abort()}catch{}
  }

  function scheduleListening(delay=300){
    clearRetry();
    if(!enabled||jarvisSpeaking||document.hidden||permissionBlocked)return;
    retryTimer=setTimeout(startListening,delay);
  }

  function startListening(){
    clearRetry();
    if(!enabled||jarvisSpeaking||document.hidden||permissionBlocked||recognitionRunning)return;
    if(!Recognition){
      updateHint('🎙️ Ascolto continuo non disponibile in questo browser',false);
      return;
    }

    const current=new Recognition();
    recognition=current;
    current.lang='it-IT';
    current.interimResults=false;
    current.continuous=false;
    current.maxAlternatives=1;

    current.onstart=()=>{
      recognitionRunning=true;
      setStage('listening');
      updateHint('🎙️ In ascolto continuo',true);
    };

    current.onresult=(event)=>{
      const result=event.results&&event.results[event.results.length-1];
      const transcript=result&&result[0]&&result[0].transcript?result[0].transcript.trim():'';
      if(!transcript)return;

      const now=Date.now();
      if(transcript===lastTranscript&&now-lastTranscriptAt<1800)return;
      lastTranscript=transcript;
      lastTranscriptAt=now;

      const input=document.getElementById('q');
      if(input)input.value=transcript;
      if(typeof window.run==='function')setTimeout(()=>window.run(),20);
    };

    current.onerror=(event)=>{
      recognitionRunning=false;
      recognition=null;
      const code=event&&event.error?event.error:'';
      if(code==='not-allowed'||code==='service-not-allowed'){
        permissionBlocked=true;
        setStage('');
        updateHint('🎙️ Tocca una volta e consenti il microfono',false);
        return;
      }
      if(code==='audio-capture'){
        updateHint('🎙️ Microfono non disponibile',false);
        scheduleListening(1200);
        return;
      }
      if(code!=='aborted')scheduleListening(code==='no-speech'?250:700);
    };

    current.onend=()=>{
      recognitionRunning=false;
      recognition=null;
      if(enabled&&!jarvisSpeaking)scheduleListening(260);
    };

    try{current.start()}catch{
      recognitionRunning=false;
      recognition=null;
      scheduleListening(650);
    }
  }

  window.speak=function(text,force=false){
    jarvisSpeaking=true;
    stopListening();
    if(baseSpeak)baseSpeak(text,force);

    let checks=0;
    const waitForSpeechEnd=()=>{
      checks+=1;
      if(window.speechSynthesis&&window.speechSynthesis.speaking&&checks<240){
        retryTimer=setTimeout(waitForSpeechEnd,100);
        return;
      }
      jarvisSpeaking=false;
      setStage('');
      scheduleListening(360);
    };
    retryTimer=setTimeout(waitForSpeechEnd,180);
  };

  window.enableVoice=function(greet=true){
    enabled=true;
    permissionBlocked=false;
    localStorage.setItem(preferenceKey,'1');
    updateHint('🎙️ In ascolto continuo',true);
    const result=baseEnable?baseEnable(greet):true;
    if(!greet)scheduleListening(120);
    else scheduleListening(900);
    return result;
  };

  window.listen=function(){
    window.enableVoice(false);
    startListening();
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopListening();
    else if(enabled){
      permissionBlocked=false;
      scheduleListening(450);
    }
  });

  const hint=document.getElementById('voiceHint');
  if(hint)hint.onclick=(event)=>{
    event.preventDefault();
    window.enableVoice(true);
  };

  const stageElement=document.getElementById('stage');
  if(stageElement)stageElement.onclick=()=>{
    if(!enabled||permissionBlocked)window.enableVoice(true);
    else if(typeof window.toast==='function')window.toast('Jarvis è già in ascolto continuo');
  };

  if(enabled){
    updateHint('🎙️ Ripristino ascolto continuo…',true);
    scheduleListening(850);
  }else{
    updateHint('🎙️ Tocca una volta: poi Jarvis resta in ascolto',false);
  }
})();
`;

  const scriptEnd = source.lastIndexOf("</script>");
  if (scriptEnd !== -1) {
    source = source.slice(0, scriptEnd) + continuousCode + source.slice(scriptEnd);
  }
}

if (source === original) {
  console.log("Jarvis voice features already applied.");
} else {
  fs.writeFileSync(filePath, source);
  console.log("Applied Jarvis voice unlock and continuous listening.");
}
