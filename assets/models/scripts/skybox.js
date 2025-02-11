// SKYBOX

export function Skybox(THREE, scene) {
        let materialArray = []
    
        let skybox_top = new THREE.TextureLoader().load('../../../assets/textures/skybox/top.jpg')
        let skybox_bot = new THREE.TextureLoader().load('../../../assets/textures/skybox/bot.jpg')
        let skybox_front = new THREE.TextureLoader().load('../../../assets/textures/skybox/front.jpg')
        let skybox_back = new THREE.TextureLoader().load('../../../assets/textures/skybox/back.jpg')
        let skybox_left = new THREE.TextureLoader().load('../../../assets/textures/skybox/left.jpg')
        let skybox_right = new THREE.TextureLoader().load('../../../assets/textures/skybox/right.jpg')
        let skybox_materials = [
            skybox_front, 
            skybox_back, 
            skybox_top,
            skybox_bot, 
            skybox_right,
            skybox_left, 
        ]
    
        for(let i=0; i < skybox_materials.length; i++) {
            materialArray.push(new THREE.MeshBasicMaterial({ map: skybox_materials[i], side: THREE.BackSide}))
        }
    
        let skybox_geo = new THREE.BoxGeometry(50,50,50)
        let skybox = new THREE.Mesh(skybox_geo, materialArray)
        scene.add(skybox)
}