import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function Grass(scene) {
    const loader = new GLTFLoader();

    const newMat = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
    });

    newMat.uniforms = {
        time: { value: 0 },
    };

    newMat.onBeforeCompile = function (shader) {
        shader.uniforms.time = newMat.uniforms.time;

        shader.vertexShader = `
            uniform float time;
            ${shader.vertexShader}
        `;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float dispPower = 1.0 - sin(uv.y * 3.1416 / 2.0);
            float displacement = sin(position.z + time * 5.0) * (0.1 * dispPower);
            transformed.z += displacement;
            `
        );

        newMat.userData.shader = shader;
    };

    loader.load('/assets/models/grass_patch.glb', (gltf) => {
        const grass = gltf.scene.children[0];

        const instanceCount = 100000

        const mesh = new THREE.InstancedMesh(grass.geometry.clone(), newMat, instanceCount);
        mesh.scale.set(3, 3, 3);
        scene.add(mesh);

        const positions = new THREE.Object3D();
        for (let i = 0; i < instanceCount; i++) {
            positions.position.x = Math.random() * 1000 - 500;
            positions.position.y = -0.1;
            positions.position.z = Math.random() * 1000 - 500;
            positions.rotation.y = Math.random() * 100;
            positions.updateMatrix();
            mesh.setMatrixAt(i, positions.matrix);
        }
    });

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        newMat.uniforms.time.value = clock.getElapsedTime();
    }
    animate();
}