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
    '<div id="stateLabel" class="state-label">In attesa</div><button id="voiceHint" class="voice-hint" onclick="enableVoice(true)">🔊 Tocca per attivare la voce</button>',
  );
}

const oldSpeech = "function speak(text){if(!('speechSynthesis'in window)){stage('');return}speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang='it-IT';u.rate=.96;u.pitch=.88;u.onstart=()=>stage('speaking');u.onend=()=>stage('');speechSynthesis.speak(u)}";
const newSpeech = `let voiceUnlocked=false,jarvisVoice=null;
function loadJarvisVoices(){if(!('speechSynthesis'in window))return;let voices=speechSynthesis.getVoices();jarvisVoice=voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith('it')&&/luca|cosimo|diego|male|ital/i.test(v.name))||voices.find(v=>v.lang&&v.lang.toLowerCase().startsWith('it'))||null}
if('speechSynthesis'in window){loadJarvisVoices();speechSynthesis.addEventListener?.('voiceschanged',loadJarvisVoices)}
function enableVoice(greet=true){let hint=document.getElementById('voiceHint');if(!('speechSynthesis'in window)){if(hint)hint.textContent='Voce non disponibile qui: apri la pagina in Safari';addMsg('Per sentirmi, apri questa pagina direttamente in Safari. Il browser interno può bloccare la voce.','ai');return false}voiceUnlocked=true;speechSynthesis.cancel();speechSynthesis.resume();loadJarvisVoices();if(hint){hint.textContent='🔊 Voce attiva';hint.classList.add('active')}if(greet)speak('Buonasera Daniele. Voce attivata. Sono pronto.',true);return true}
function speak(text,force=false){if(!('speechSynthesis'in window)){stage('');return}if(!voiceUnlocked&&!force){let hint=document.getElementById('voiceHint');if(hint)hint.textContent='🔊 Tocca per sentire Jarvis';stage('');return}speechSynthesis.cancel();speechSynthesis.resume();let u=new SpeechSynthesisUtterance(text);u.lang='it-IT';u.rate=.93;u.pitch=.82;u.volume=1;if(jarvisVoice)u.voice=jarvisVoice;u.onstart=()=>stage('speaking');u.onend=()=>stage('');u.onerror=()=>{stage('');let hint=document.getElementById('voiceHint');if(hint)hint.textContent='Apri in Safari e tocca di nuovo per la voce'};speechSynthesis.speak(u)}`;
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

if (source === original) {
  console.log("Jarvis voice unlock already applied.");
} else {
  fs.writeFileSync(filePath, source);
  console.log("Applied Jarvis iPhone voice unlock.");
}
