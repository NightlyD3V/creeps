import * as THREE from 'three';

class FirstPersonController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement || document.body;

    this.movementSpeed = 5; // Adjust movement speed
    this.lookSpeed = 0.1; // Adjust look speed

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    this.mouseX = 0;
    this.mouseY = 0;

    this.verticalLookRotation = 0;
    this.horizontalLookRotation = 0;

    this.headBobAmplitude = 0.1; // Adjust head bob amplitude
    this.headBobFrequency = 10; // Adjust head bob frequency
    this.headBobOffset = 0;


    this.velocity = new THREE.Vector3();
    this.moveDirection = new THREE.Vector3();

    this.domElement.addEventListener('mousemove', this.onMouseMove.bind(this), false);
    document.addEventListener('keydown', this.onKeyDown.bind(this), false);
    document.addEventListener('keyup', this.onKeyUp.bind(this), false);

    this.camera.rotation.order = 'YXZ'; // Important for correct rotation order
  }

  onMouseMove(event) {
    const movementX = event.movementX || event.mozMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || 0;

    this.horizontalLookRotation -= movementX * this.lookSpeed * 0.002;
    this.verticalLookRotation -= movementY * this.lookSpeed * 0.002;

    // Clamp vertical rotation to prevent looking straight up/down
    this.verticalLookRotation = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.verticalLookRotation));
  }

  onKeyDown(event) {
    switch (event.code) {
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'KeyD':
        this.moveRight = true;
        break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'KeyD':
        this.moveRight = false;
        break;
    }
  }

  update(delta) {

    this.moveDirection.set(0, 0, 0);

    if (this.moveForward) {
      this.moveDirection.z = -1;
    }
    if (this.moveBackward) {
      this.moveDirection.z = 1;
    }
    if (this.moveLeft) {
      this.moveDirection.x = -1;
    }
    if (this.moveRight) {
      this.moveDirection.x = 1;
    }

    this.moveDirection.normalize();

    this.velocity.x = this.moveDirection.x * this.movementSpeed;
    this.velocity.z = this.moveDirection.z * this.movementSpeed;

    // Apply head bob when moving
    if (this.moveDirection.length() > 0) {
      this.headBobOffset += delta * this.headBobFrequency;
      const bob = Math.sin(this.headBobOffset) * this.headBobAmplitude;
      this.camera.position.y += bob;

      // Apply slight tilt during movement.  Adjust the tilt amount.
      const tilt = Math.sin(this.headBobOffset) * 0.05; // Example tilt
      this.camera.rotation.z = tilt; // Apply tilt
    } else {
        // Reset tilt smoothly
        this.camera.rotation.z *= 0.9; // Smoothly reduce over time.  Adjust value for speed.
        if (Math.abs(this.camera.rotation.z) < 0.001) this.camera.rotation.z = 0; // Set to 0 if close enough
    }


    this.camera.rotation.y = this.horizontalLookRotation;
    this.camera.rotation.x = this.verticalLookRotation;

    // Translate the camera based on velocity
    this.camera.translateZ(this.velocity.z);
    this.camera.translateX(this.velocity.x);

  }

  getVelocity() {
    return this.velocity;
  }
}


export default FirstPersonController;