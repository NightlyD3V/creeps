// Audio FX for skeleton attack
// Loads and plays deadly-strike and hit-miss sounds

let deadlyStrikeBuffer = null;
let hitMissBuffer = null;

export function loadSkeletonFx(audioContext) {
    if (!audioContext) return;
    fetch('/assets/sounds/fx/deadly-strike.mp3')
        .then(r => r.arrayBuffer())
        .then(b => audioContext.decodeAudioData(b))
        .then(buffer => { deadlyStrikeBuffer = buffer; });
    fetch('/assets/sounds/fx/hit-miss.mp3')
        .then(r => r.arrayBuffer())
        .then(b => audioContext.decodeAudioData(b))
        .then(buffer => { hitMissBuffer = buffer; });
}

export function playDeadlyStrike(audioContext, masterGain) {
    if (!audioContext || !deadlyStrikeBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = deadlyStrikeBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(masterGain || audioContext.destination);
    source.start(0);
}

export function playHitMiss(audioContext, masterGain) {
    if (!audioContext || !hitMissBuffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = hitMissBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(masterGain || audioContext.destination);
    source.start(0);
}
