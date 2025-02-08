import * as THREE from 'three'

const homepage_sound = document.getElementById('homepage-sound')
const typing_sound = document.getElementById('typing-sound')
const item_sound = document.getElementById('item-sound')
const button_sound = document.getElementById('button-click-sound')
const start_button = document.getElementById('start-button')
const title = document.getElementById('top-content')
const loader = document.getElementById('loading')
const fuzz = document.getElementById('fuzz-overlay')

start_button.addEventListener('click', (event) => {
    event.preventDefault
    button_sound.play()
    start_button.disabled = true
    fuzz.style.display = 'inline'
    homepage_sound.play()
    typing_sound.play()
    fadeOut(title, 500)
    fadeIn(loader, 3000)
    typewriterEffect(textElement, wordsToType, typingSpeed, pauseTime);
})

function fadeIn(element, duration) {
    element.style.opacity = 0;
    let startTime = null;
  
    function animation(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1); // Ensure progress doesn't exceed 1
  
      element.style.opacity = progress;
  
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }
    requestAnimationFrame(animation);
  }
  

function fadeOut(element, duration) {
    element.style.opacity = 1;
    let startTime = null;
  
    function animation(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
  
      element.style.opacity = 1 - progress;
  
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }
    requestAnimationFrame(animation);
  }

  function typewriterEffect(element, words, baseSpeed, pauseAfterWord) {
    let wordIndex = 0;
    let charIndex = 0;
    let currentWord = '';
    let isPausing = false;

    function type() {
        if (wordIndex < words.length) {
            currentWord = words[wordIndex];
            if (charIndex < currentWord.length) {
                if (!isPausing) {
                    if(wordIndex == 5) {
                        item_sound.play();
                    }
                    element.textContent += currentWord.charAt(charIndex);
                    charIndex++;

                    const speed = baseSpeed + Math.floor(Math.random() * 50) - 25;

                    if (Math.random() < 0.05) {
                        setTimeout(eraseChar, speed / 2);
                    } else {
                        setTimeout(type, speed);
                    }
                }
            } else {
                isPausing = true;
                if (wordIndex === words.length - 1) { // Check if it's the last word
                    setTimeout(() => { isPausing = false; }, pauseAfterWord); // Pause, then stop
                    const delay = 3000; // 5 seconds delay

                    setTimeout(() => {
                      // Redirect to the Three.js page
                      window.location.href = "./src/levels/1/level_1.html"; 
                    }, delay);
                  
                } else {
                    setTimeout(erase, pauseAfterWord + Math.random() * 200); // Regular pause and erase
                }
            }
        }
    }

    function erase() {
        if (charIndex > 0) {
            element.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            setTimeout(erase, baseSpeed / 2 + Math.random() * 50);
        } else {
            wordIndex++;
            isPausing = false;
            setTimeout(type, baseSpeed * 5 + Math.random() * 300);
        }
    }

    function eraseChar() {
        if (charIndex > 0) {
            element.textContent = currentWord.substring(0, charIndex - 1);
            charIndex--;
            setTimeout(type, baseSpeed + Math.random() * 50 - 25);
        } else {
            setTimeout(type, baseSpeed + Math.random() * 50 - 25);
        }
    }

    type();
}

const textElement = document.getElementById('typewriter-text');
const wordsToType = ["CREATING WORLD . . .", "COMPILING SHADERS . . .", "INITIALIZING PLAYER . . .", "SUMMONING CREEPS . . .", "DONT LOOK BEHIND YOU . . .", "CONNECTION ESTABLISHED!", "LAUNCHING GAME . . ."];
const typingSpeed = 70;
const pauseTime = 1500;
