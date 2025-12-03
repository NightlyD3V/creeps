import * as THREE from 'three/webgpu';

export class EnemyAI {
    constructor(scene, world, camera, characterBody, RAPIER) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.characterBody = characterBody;
        this.RAPIER = RAPIER;
        
        // Enemy properties
        this.position = new THREE.Vector3(-30, 5, -30);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.moveSpeed = 3;
        this.chaseSpeed = 7;
        this.patrolSpeed = 2;
        this.detectionRange = 60; // How far the enemy can see
        this.detectionAngle = Math.PI * 0.6; // ~108 degree cone in front
        
        // States: 'patrol', 'chase', 'pathfind'
        this.state = 'patrol';
        this.isChasing = false;
        this.chaseCooldown = 0;
        
        // Physics setup
        this.radius = 0.6;
        this.height = 2;
        this.createPhysics();
        
        // Character controller for collision
        this.characterController = world.createCharacterController(0.2);
        this.characterController.enableAutostep(0.7, 0.5, true);
        this.characterController.enableSnapToGround(0.5);
        this.characterController.setCharacterMass(80);
        this.characterController.setApplyImpulsesToDynamicBodies(true);
        
        // Gravity
        this.verticalVelocity = 0;
        this.gravity = -30;
        
        // Visual
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
        
        // Initial facing direction - away from player (toward positive X)
        this.facingDirection = new THREE.Vector3(1, 0, 0);
        this.mesh.lookAt(this.position.x + 1, this.position.y, this.position.z);
        
        // Detection visualization
        this.lastSeenPosition = null;
        this.investigationTimer = 0;
        this.investigationDuration = 60;
        
        // Patrol system - small area around starting position
        this.patrolCenter = new THREE.Vector3(-30, 5, -30);
        this.patrolRadius = 10; // Patrol in a 10 unit radius
        this.patrolAngle = 0; // Current angle for circular patrol
        this.patrolWaitTimer = 0;
        this.patrolWaitDuration = 2; // Wait 2 seconds at each point
        
        // Pathfinding
        this.isPathing = false;
        this.pathNodes = [];
        this.currentPathIndex = 0;
        this.pathUpdateTimer = 0;
        this.pathUpdateInterval = 2;
        
        // Stuck detection
        this.lastPosition = this.position.clone();
        this.stuckTimer = 0;
        this.stuckThreshold = 1;
        this.minMovementDistance = 0.5;
        
        // Path attempt counter - to try different paths when stuck
        this.pathAttempt = 0;
        
        // Wall following for better pathfinding
        this.wallFollowDirection = 1; // 1 = right, -1 = left
        this.wallFollowTimer = 0;
    }
    
    createPhysics() {
        // Create kinematic body for enemy
        const bodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z);
        this.body = this.world.createRigidBody(bodyDesc);
        
        // Create collider
        const colliderDesc = this.RAPIER.ColliderDesc.capsule(
            (this.height / 2) - this.radius,
            this.radius
        );
        this.collider = this.world.createCollider(colliderDesc, this.body);
    }
    
    createMesh() {
        const group = new THREE.Group();
        
        // Body
        const bodyGeometry = new THREE.CapsuleGeometry(this.radius, this.height - 2 * this.radius, 4, 8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x8B0000, // Dark red
            roughness: 0.7,
            metalness: 0.3,
            emissive: 0x440000
        });
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(bodyMesh);
        
        // Head (small sphere)
        const headGeometry = new THREE.SphereGeometry(this.radius * 0.8, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xA00000,
            roughness: 0.6,
            metalness: 0.2,
            emissive: 0x550000
        });
        const headMesh = new THREE.Mesh(headGeometry, headMaterial);
        headMesh.position.y = this.height / 2;
        group.add(headMesh);
        
        // Eyes (glowing red when chasing)
        const eyeGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const eyeMaterialIdle = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
        const eyeMaterialChase = new THREE.MeshBasicMaterial({ color: 0xFF6666 });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterialIdle);
        leftEye.position.set(-0.25, this.height / 2 + 0.3, this.radius * 0.5);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterialIdle);
        rightEye.position.set(0.25, this.height / 2 + 0.3, this.radius * 0.5);
        group.add(rightEye);
        
        group.userData.eyes = [leftEye, rightEye];
        group.userData.eyeMaterials = [eyeMaterialIdle, eyeMaterialChase];
        
        return group;
    }
    
    canSeePlayer(characterPos, checkViewAngle = false) {
        const distance = this.position.distanceTo(characterPos);
        
        if (distance > this.detectionRange) {
            return false;
        }
        
        // Optional: Check if player is within viewing angle (for patrol state)
        if (checkViewAngle) {
            const toPlayer = characterPos.clone().sub(this.position);
            toPlayer.y = 0;
            toPlayer.normalize();
            
            // Make sure facingDirection is normalized
            const facing = this.facingDirection.clone().normalize();
            const dot = facing.dot(toPlayer);
            
            // cos(75°) ≈ 0.26, giving roughly 150° field of view
            if (dot < 0.26) {
                return false; // Player is behind enemy
            }
        }
        
        // Line-of-sight raycast check
        const direction = characterPos.clone().sub(this.position);
        direction.y = 0; // Keep ray horizontal to avoid ground hits
        const rayLength = direction.length();
        
        if (rayLength < 0.1) return true; // Too close to raycast
        
        direction.normalize();
        
        const rayOrigin = new this.RAPIER.Vector3(
            this.position.x,
            this.position.y + 1, // Eye level
            this.position.z
        );
        const rayDir = new this.RAPIER.Vector3(direction.x, 0, direction.z); // Horizontal ray
        const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
        
        // Cast ray toward player
        const hit = this.world.castRay(ray, rayLength, true);
        
        if (hit) {
            const hitCollider = hit.collider;
            // If we hit something that's not us and not the player, wall blocks view
            if (hitCollider !== this.collider) {
                const hitBody = hitCollider.parent();
                if (hitBody !== this.characterBody) {
                    // Hit a wall or obstacle before reaching player
                    return false;
                }
            }
        }
        
        return true;
    }
    
    update(delta, characterPos) {
        const distance = this.position.distanceTo(characterPos);
        // During patrol, only detect in front; during chase/pathfind, detect 360°
        const useViewAngle = this.state === 'patrol';
        const canSee = this.canSeePlayer(characterPos, useViewAngle);
        
        // Smooth out canSee with a counter to avoid flickering
        // Increase faster than decrease to make vision "sticky"
        if (canSee) {
            this.canSeeCounter = Math.min((this.canSeeCounter || 0) + 3, 15);
        } else {
            this.canSeeCounter = Math.max((this.canSeeCounter || 0) - 1, 0);
        }
        // Consider "can see" if counter is above threshold
        const stableCanSee = this.canSeeCounter >= 5;
        
        // Debug every few frames
        this.debugTimer = (this.debugTimer || 0) + delta;
        if (this.debugTimer > 2) {
            console.log(`State: ${this.state}, Distance: ${distance.toFixed(1)}, CanSee: ${stableCanSee} (counter: ${this.canSeeCounter})`);
            this.debugTimer = 0;
        }
        
        // GLOBAL: If player is visible, switch to chase (but NOT if we're pathfinding - let pathfinding complete)
        if (stableCanSee && this.state === 'patrol') {
            console.log('Player detected! Starting chase. Distance:', distance);
            this.state = 'chase';
            this.isChasing = true;
            this.isPathing = false;
            this.lastSeenPosition = new THREE.Vector3(characterPos.x, this.position.y, characterPos.z);
            this.stuckTimer = 0;
            this.lastPosition = this.position.clone();
        }
        
        // State machine
        switch (this.state) {
            case 'patrol':
                this.updatePatrol(delta);
                break;
            case 'chase':
                this.updateChase(delta, characterPos, stableCanSee, distance);
                break;
            case 'pathfind':
                this.updatePathfind(delta, characterPos, stableCanSee, distance);
                break;
        }
        
        // Apply gravity
        this.verticalVelocity += this.gravity * delta;
        this.verticalVelocity = Math.max(this.verticalVelocity, -50);
        
        // Update mesh
        this.mesh.position.copy(this.position);
        
        // Update eye color based on state
        const eyes = this.mesh.userData.eyes;
        const materials = this.mesh.userData.eyeMaterials;
        const eyeMaterial = this.state === 'chase' ? materials[1] : materials[0];
        eyes.forEach(eye => {
            eye.material = eyeMaterial;
        });
    }
    
    updatePatrol(delta) {
        // Simple circular patrol around center point
        if (this.patrolWaitTimer > 0) {
            this.patrolWaitTimer -= delta;
            return;
        }
        
        // Calculate next patrol point on a circle
        const targetX = this.patrolCenter.x + Math.cos(this.patrolAngle) * this.patrolRadius;
        const targetZ = this.patrolCenter.z + Math.sin(this.patrolAngle) * this.patrolRadius;
        const targetPatrolPoint = new THREE.Vector3(targetX, this.position.y, targetZ);
        
        const distToPatrol = this.position.distanceTo(targetPatrolPoint);
        
        if (distToPatrol < 2) {
            // Reached patrol point, wait then move to next angle
            this.patrolWaitTimer = this.patrolWaitDuration;
            this.patrolAngle += Math.PI / 2; // Move 90 degrees around circle
        } else {
            // Move toward patrol point
            this.moveToward(targetPatrolPoint, this.patrolSpeed, delta);
        }
    }
    
    updateChase(delta, characterPos, canSee, distance) {
        // Track time since last seeing player
        if (canSee) {
            this.lastSeenPosition = new THREE.Vector3(
                characterPos.x,
                this.position.y,
                characterPos.z
            );
            this.lostPlayerTimer = 0;
        } else {
            this.lostPlayerTimer = (this.lostPlayerTimer || 0) + delta;
            
            // If lost player for 3 seconds, return to patrol
            if (this.lostPlayerTimer > 3) {
                console.log('Lost player for too long, returning to patrol');
                this.state = 'patrol';
                this.isChasing = false;
                this.lostPlayerTimer = 0;
                return;
            }
        }
        
        // Move toward player's last known position
        if (this.lastSeenPosition) {
            const distToLastSeen = this.position.distanceTo(this.lastSeenPosition);
            
            if (distToLastSeen < 2 && !canSee) {
                // Reached last seen position but can't see player - go back to patrol
                console.log('Reached last position, player gone - returning to patrol');
                this.state = 'patrol';
                this.isChasing = false;
                this.lostPlayerTimer = 0;
                return;
            }
            
            // Actually move!
            this.moveToward(this.lastSeenPosition, this.chaseSpeed, delta);
        }
        
        // Check if stuck AFTER moving
        const movedDistance = this.position.distanceTo(this.lastPosition);
        if (movedDistance < this.minMovementDistance) {
            this.stuckTimer += delta;
            
            if (this.stuckTimer >= this.stuckThreshold) {
                console.log('Stuck while chasing - switching to pathfinding');
                this.state = 'pathfind';
                this.isChasing = false;
                this.isPathing = true;
                this.pathAttempt = 0;
                this.wallFollowDirection = Math.random() > 0.5 ? 1 : -1;
                this.generateWallFollowPath(characterPos);
                this.stuckTimer = 0;
                this.canSeeCounter = 0; // Reset vision counter so pathfinding can complete
            }
        } else {
            this.stuckTimer = 0;
        }
        this.lastPosition = this.position.clone();
    }
    
    updatePathfind(delta, characterPos, canSee, distance) {
        // Switch to chase if we can see player AND either:
        // 1. We've moved past first waypoint, OR
        // 2. We're close to the player (pathfinding worked!)
        if (canSee && (this.currentPathIndex > 0 || distance < 15)) {
            this.pathUpdateTimer += delta;
            if (this.pathUpdateTimer > 0.3) {
                console.log('Can see player - resuming chase. Distance:', distance.toFixed(1));
                this.state = 'chase';
                this.isChasing = true;
                this.isPathing = false;
                this.lastSeenPosition = new THREE.Vector3(characterPos.x, this.position.y, characterPos.z);
                this.pathUpdateTimer = 0;
                this.lostPlayerTimer = 0;
                this.stuckTimer = 0;
                this.lastPosition = this.position.clone();
                return;
            }
        } else {
            this.pathUpdateTimer = 0;
        }
        
        // Check if stuck during pathfinding
        const movedDistance = this.position.distanceTo(this.lastPosition);
        if (movedDistance < this.minMovementDistance) {
            this.stuckTimer += delta;
            
            if (this.stuckTimer >= this.stuckThreshold) {
                this.pathAttempt++;
                console.log(`Stuck during pathfinding, trying attempt ${this.pathAttempt}`);
                
                // Alternate wall follow direction
                if (this.pathAttempt % 2 === 0) {
                    this.wallFollowDirection *= -1;
                }
                
                this.generateWallFollowPath(characterPos);
                this.stuckTimer = 0;
                
                // If tried many times, reset to patrol
                if (this.pathAttempt > 10) {
                    console.log('Too many path attempts, returning to patrol');
                    this.state = 'patrol';
                    this.isPathing = false;
                    this.pathAttempt = 0;
                }
            }
        } else {
            this.stuckTimer = 0;
        }
        this.lastPosition = this.position.clone();
        
        // Follow path nodes
        if (this.pathNodes.length > 0 && this.currentPathIndex < this.pathNodes.length) {
            const targetNode = this.pathNodes[this.currentPathIndex];
            const distToNode = this.position.distanceTo(targetNode);
            
            if (distToNode < 2) {
                this.currentPathIndex++;
                if (this.currentPathIndex >= this.pathNodes.length) {
                    // Finished path
                    this.isPathing = false;
                    if (canSee) {
                        this.state = 'chase';
                        this.isChasing = true;
                        this.lastSeenPosition = characterPos.clone();
                    } else {
                        this.state = 'patrol';
                    }
                }
            } else {
                this.moveToward(targetNode, this.moveSpeed, delta);
            }
        } else {
            // No path, go back to patrol
            this.state = 'patrol';
            this.isPathing = false;
        }
    }
    
    moveToward(targetPos, speed, delta) {
        const direction = targetPos.clone().sub(this.position);
        direction.y = 0;
        const dist = direction.length();
        
        if (dist > 0.1) {
            direction.normalize();
            this.facingDirection.copy(direction);
            
            const movement = new this.RAPIER.Vector3(
                direction.x * speed * delta,
                this.verticalVelocity * delta,
                direction.z * speed * delta
            );
            
            this.characterController.computeColliderMovement(this.collider, movement);
            const corrected = this.characterController.computedMovement();
            
            const currentPos = this.body.translation();
            this.position.set(
                currentPos.x + corrected.x,
                currentPos.y + corrected.y,
                currentPos.z + corrected.z
            );
            
            this.body.setNextKinematicTranslation({
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            });
            
            // Face movement direction
            this.mesh.lookAt(
                this.position.x + direction.x,
                this.position.y,
                this.position.z + direction.z
            );
        }
    }
    
    generateWallFollowPath(targetPos) {
        this.pathNodes = [];
        this.currentPathIndex = 0;
        
        const startPos = this.position.clone();
        const toTarget = targetPos.clone().sub(startPos);
        toTarget.y = 0;
        const distToTarget = toTarget.length();
        
        if (distToTarget < 1) {
            this.pathNodes.push(targetPos);
            return;
        }
        
        toTarget.normalize();
        
        // Get perpendicular direction (wall follow direction)
        const perpendicular = new THREE.Vector3(
            -toTarget.z * this.wallFollowDirection,
            0,
            toTarget.x * this.wallFollowDirection
        );
        
        // Use SMALLER distances - just enough to step around a wall
        const sideDistances = [3, 5, 4, 6, 2, 7, 8, 3];
        const forwardDistances = [4, 6, 5, 8, 3, 5, 7, 4];
        
        const sideIdx = this.pathAttempt % sideDistances.length;
        const sideDist = sideDistances[sideIdx];
        const forwardDist = forwardDistances[sideIdx];
        
        // Create simple L-shaped path: side step, then toward target
        const waypoint1 = startPos.clone().addScaledVector(perpendicular, sideDist);
        waypoint1.y = startPos.y; // Keep same height
        
        const waypoint2 = waypoint1.clone().addScaledVector(toTarget, forwardDist);
        waypoint2.y = startPos.y;
        
        console.log(`Wall-follow path (dir=${this.wallFollowDirection}, side=${sideDist}, fwd=${forwardDist})`);
        
        this.pathNodes.push(waypoint1);
        this.pathNodes.push(waypoint2);
        // Don't add target - let chase mode take over once we can see player
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    destroy() {
        this.scene.remove(this.mesh);
        // Remove physics body if needed
    }
}
