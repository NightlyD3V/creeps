import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default class Page {
  constructor() {
    this.loader = new GLTFLoader();
    this.group = new THREE.Group(); // placeholder until GLTF loads
    this.loadModel();
  }

  loadModel() {
    this.loader.load('../../../assets/models/paper.glb', (gltf) => {
      this.model = gltf.scene;
      this.model.scale.set(0.5, 0.5, 0.5);
      this.model.position.set(0, 5, 0);
      this.group.add(this.model); // attach to group so index.js can reference predictably
      // this.model.traverse((child) => {
      //     if (child.isMesh) {
      //         child.userData.isInteractive = true;   // mark it
      //         // optional: give it a custom label
      //         child.userData.label = "Ancient Letter\n<i>Hold E to read</i>";
      //         dynamicBodies.push(child); // register for interaction
      //     }
      // });
  
    },undefined, function (error) {
        console.error('An error happened while loading the page model:', error);
    }); 
  }
  update() {
    this.group.rotation.y += 0.01; // safe even if model isn't loaded yet
  }
}
