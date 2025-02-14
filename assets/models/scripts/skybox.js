// SKYBOX

export function Skybox(THREE, scene) {
        // let materialArray = []
    
        // let skybox_top = new THREE.TextureLoader().load('../../../assets/materials/skybox/top.jpg')
        // let skybox_bot = new THREE.TextureLoader().load('../../../assets/materials/skybox/bot.jpg')
        // let skybox_front = new THREE.TextureLoader().load('../../../assets/materials/skybox/front.jpg')
        // let skybox_back = new THREE.TextureLoader().load('../../../assets/materials/skybox/back.jpg')
        // let skybox_left = new THREE.TextureLoader().load('../../../assets/materials/skybox/left.jpg')
        // let skybox_right = new THREE.TextureLoader().load('../../../assets/materials/skybox/right.jpg')
        // let skybox_materials = [
        //     skybox_front, 
        //     skybox_back, 
        //     skybox_top,
        //     skybox_bot, 
        //     skybox_right,
        //     skybox_left, 
        // ]
    
        // for(let i=0; i < skybox_materials.length; i++) {
        //     materialArray.push(new THREE.MeshBasicMaterial())
        // }

        let material = new THREE.MeshBasicMaterial({color: 0x000000, side: THREE.BackSide})
        let skybox_geo = new THREE.BoxGeometry(300,300,300)
        let skybox = new THREE.Mesh(skybox_geo, material)
        scene.add(skybox)
}