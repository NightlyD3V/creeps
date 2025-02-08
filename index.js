console.log("Hello, World!")

const homepage_sound = document.getElementById('homepage-sound')
const start_button = document.getElementById('start-button')

start_button.addEventListener('click', (event) => {
    homepage_sound.play()
})