console.log("Hello, World!")

const homepage_sound = document.getElementById('homepage-sound')
const typing_sound = document.getElementById('typing-sound')
const start_button = document.getElementById('start-button')
const title = document.getElementById('top-content')
const loader = document.getElementById('loading')

start_button.addEventListener('click', (event) => {
    homepage_sound.play()
    typing_sound.play()
    fadeOut(title, 1000)
    fadeIn(loader, 3000)
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