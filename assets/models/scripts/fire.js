import * as THREE from 'three'

export function Fire(cam, uniforms) {
    console.log("FIRE")
    // SHADER 
    const vertexShader = `
        varying vec2 vUv;
        uniform float time;

        void main() {
            gl_Position = projectionMatrix * modelViewPosition;
        }
        `;
    
        const fragmentShader = `
        uniform float time;
        void main() {
            gl_FragColor = vec4(sin(1.0 * time),sin(0.5*time),sin(time * 1.0),1.0);
        }
        `;
        const customShader = new THREE.ShaderMaterial({
            // vertexShader, 
            fragmentShader, 
            side: THREE.DoubleSide,
            uniforms
        })
        // END SHADER
    // CREATE PLANE 
    const geo = new THREE.PlaneGeometry(0.3,0.3)
    const plane = new THREE.Mesh(geo, customShader) 
    plane.position.set( -3.5,1,0 );
    plane.rotation.x = 80
    cam.add(plane)

    const geo2 = new THREE.PlaneGeometry(0.3,0.3)
    const plane2 = new THREE.Mesh(geo2, customShader) 
    plane2.position.set( -3,1,0 );
    plane2.rotation.x = 80
    cam.add(plane2)

    const geo3 = new THREE.PlaneGeometry(0.3,0.3)
    const plane3 = new THREE.Mesh(geo3, customShader) 
    plane3.position.set( -2.5,1,0 );
    plane3.rotation.x = 80
    cam.add(plane3)

    // CUSTOM SHADER 

}