import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Reusable temp vectors to avoid garbage collection
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _tempVec4 = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _playerDir = new THREE.Vector3();
const _facing = new THREE.Vector3();
const _avoidance = new THREE.Vector3();
const _sampleDir = new THREE.Vector3();
const _perpendicular = new THREE.Vector3();
const _escapeDir = new THREE.Vector3();
const _escapeMovement = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _steeringDir = new THREE.Vector3();
const _movement = new THREE.Vector3();
const _clearDir = new THREE.Vector3();

export class EnemyAI {
    constructor(scene, world, camera, characterBody, RAPIER, audioListener = null, spawnPosition = null) {
        this.scene = scene;
        this.world = world;
        this.camera = camera;
        this.characterBody = characterBody;
        this.RAPIER = RAPIER;
        this.audioListener = audioListener;

        // Core properties - use provided spawn position or default
        const defaultSpawn = new THREE.Vector3(-60, 5, -60);
        this.position = spawnPosition ? spawnPosition.clone() : defaultSpawn;
        this.velocity = new THREE.Vector3();
        this.facingDirection = new THREE.Vector3(1, 0, 0);
        this.filteredFacing = this.facingDirection.clone();

        // Movement speeds - AGGRESSIVE
        this.speeds = {
            patrol: 3.0,              // Faster patrol
            investigate: 5.0,         // Rush to sounds
            chase: 14.0,              // Fast chase - catches walkers (10), can't catch runners (22)
            search: 5.5,              // Aggressive searching
            return: 5.0               // Quick return to patrol
        };

        // Detection ranges - balanced with fog (fogFar = 60, so player sees ~30-40 units clearly)
        this.detection = {
            sightRange: 20,            // Increased forward sight range
            sightAngle: Math.PI * 0.35, // ~63° field of view (narrower, more forward-focused)
            hearingRange: 20,          // Can hear running from moderate distance (increased)
            flashlightClickRange: 20,  // Can hear flashlight click from this distance
            chaseRange: 20             // Will chase further once engaged
        };

        // State management
        this.states = {
            PATROL: 'patrol',
            ALERT: 'alert',           // New: warning state before investigate/chase
            INVESTIGATE: 'investigate',
            CHASE: 'chase',
            SEARCH: 'search',
            RETURN: 'return',
            ATTACK: 'attack'          // Attack state when close to player
        };
        this.currentState = this.states.PATROL;
        
        // Attack state tracking
        this.attackData = {
            range: 3.0,               // Distance to trigger attack
            cooldown: 1.5,            // Time between attacks
            timer: 0,                 // Current cooldown timer
            isAttacking: false,       // Currently in attack animation
            knockbackStrength: 100,    // How hard to push player (strong knockback)
            damage: 1                 // Damage per hit
        };

        // Chase timeout tracking
        this.chaseVisibleTimer = 0;
        this.chaseVisibleTimeout = 4; // seconds to chase before searching another area
        
        // Alert state tracking
        this.alertData = {
            duration: 3.5,            // How long to stay in alert state (gives player time to react)
            timer: 0,
            targetPosition: null,     // Where the sound/sight came from
            wasFromSight: false,      // True if alerted by sight (will chase after), false if sound (will investigate)
            soundPlayed: false
        };
        
        // Glitch effect tracking - only trigger once per encounter (resets on RETURN)
        this.glitchTriggeredThisEncounter = false;

        // Memory system
        this.memory = {
            lastSeenPosition: null,
            lastSeenTime: 0,
            investigationPoints: [],
            patrolPoints: this.generatePatrolPoints(),
            homePosition: this.position.clone()
        };

        // Chase prediction
        this.chaseTarget = null;
        this.playerVelocity = new THREE.Vector3();
        this.lastPlayerSample = null;
        this.breadcrumbs = [];
        this.maxBreadcrumbs = 10;

        this.navigation = {
            obstacleSamples: 12,             // More rays for better obstacle detection
            obstacleCheckDistance: 6.0,      // Look further ahead for obstacles
            avoidanceStrength: 2.5,          // Much stronger avoidance force
            turnRate: Math.PI * 6.0,         // radians per second - very fast turning for aggressive pursuit
            stuckThreshold: 0.3,             // How long before considering stuck
            clearPathAngle: Math.PI * 0.75   // Search angle for clear path (135° each side)
        };

        this.prediction = {
            chaseLeadTime: 1.2,      // Predicts further ahead
            maxLeadDistance: 14      // Can lead target by more
        };

        // Timers
        this.timers = {
            stateChange: 0,
            stuck: 0,
            lastRaycast: 0,
            investigation: 0,
            search: 0,
            breadcrumbs: 0,
            sameDistance: 0,  // Track how long distance to player stays the same
            alert: 0                  // Alert state timer
        };

        // Track search attempts
        this.searchAttempts = 0;
        this.maxSearchAttempts = 3;
        
        // Alert sound
        this.alertSound = null;
        this.alertSoundLoaded = false;

        // Stuck detection - if distance to player doesn't change for too long
        this.stuckDetection = {
            lastDistance: 0,
            threshold: 2.0,      // Distance must change by at least this much
            timeout: 25.0        // More persistent - won't give up easily
        };

        this.occlusionTime = 0;
        this.canSeePlayer = false;
        this.heardPlayer = false;

        // Physics setup
        this.setupPhysics();

        // Visual setup - create placeholder, then load skeleton model
        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);

        // Create a persistent vision cone helper attached to the root mesh
        // (so it is visible regardless of whether the GLTF model is used)
        try {
            const wedgeLength = this.detection?.sightRange || 50;
            const wedgeAngle = this.detection?.sightAngle || Math.PI * 0.7;
            const wedgeShape = new THREE.Shape();
            wedgeShape.moveTo(0, 0);
            const segments = 24;
            const halfAngle = wedgeAngle * 0.5;
            for (let i = 0; i <= segments; i++) {
                const angle = -halfAngle + (i / segments) * wedgeAngle;
                const x = Math.sin(angle) * wedgeLength;
                const y = Math.cos(angle) * wedgeLength;
                wedgeShape.lineTo(x, y);
            }
            wedgeShape.lineTo(0, 0);
            const wedgeGeometry = new THREE.ShapeGeometry(wedgeShape);
            const wedgeMaterial = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                transparent: true,
                opacity: 0.12,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            this.visionCone = new THREE.Mesh(wedgeGeometry, wedgeMaterial);
            this.visionCone.rotation.x = Math.PI / 2;
            this.visionCone.position.set(0, 0.15, 0);
            this.mesh.add(this.visionCone);
        } catch (e) {
            console.warn('Failed to create vision cone helper:', e);
            this.visionCone = null;
        }
        this.skeletonModel = null;
        this.mixer = null;
        this.crawlAction = null;
        this.eyes = [];
        this.eyeMaterials = null; // Will be created in addGlowingEyes()
        this.eyeGlow = null;
        
        // Ready promise - resolves when model is fully loaded
        this._resolveReady = null;
        this.ready = new Promise(resolve => {
            this._resolveReady = resolve;
        });
        
        // Load the skeleton model and animation
        this.loadSkeletonModel();

        // Audio setup
        this.audio = {
            footsteps: false,
            growl: false,
            lastFootstep: 0,
            wailingSound: null,
            isWailingPlaying: false,
            tensionSound: null,
            isTensionPlaying: false
        };
        
        // Setup positional audio if listener provided
        if (this.audioListener) {
            this.setupAudio();
        }

        console.log('Enemy AI initialized at:', this.position);
    }

    setupPhysics() {
        // Create kinematic body
        const bodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(this.position.x, this.position.y, this.position.z);
        this.body = this.world.createRigidBody(bodyDesc);

        // Create capsule collider
        const colliderDesc = this.RAPIER.ColliderDesc.capsule(0.8, 0.6);
        this.collider = this.world.createCollider(colliderDesc, this.body);

        // Character controller for movement
        this.controller = this.world.createCharacterController(0.1);
        this.controller.enableAutostep(0.5, 0.3, true);
        this.controller.enableSnapToGround(0.3);
        this.controller.setCharacterMass(60);
        
        // Reusable Rapier vectors for raycasting (avoids allocations per frame)
        this._losRayOrigin = new this.RAPIER.Vector3(0, 0, 0);
        this._losRayDir = new this.RAPIER.Vector3(0, 0, 0);
        this._stuckRayOrigin = new this.RAPIER.Vector3(0, 0, 0);
        this._stuckRayDir = new this.RAPIER.Vector3(0, 0, 0);
        this._obstacleRayOrigin = new this.RAPIER.Vector3(0, 0, 0);
        this._obstacleRayDir = new this.RAPIER.Vector3(0, 0, 0);
    }

    setupAudio() {
        // Create positional audio for wailing sound
        this.audio.wailingSound = new THREE.PositionalAudio(this.audioListener);

        // Create positional audio for heavy walking footsteps
        this.audio.footstepSound = new THREE.PositionalAudio(this.audioListener);

        // Create alert sound (short growl to warn player)
        this.alertSound = new THREE.PositionalAudio(this.audioListener);

        // Load the wailing sound (use absolute path from root)
        const audioLoader = new THREE.AudioLoader();
                // Load heavy walking footstep sound
                audioLoader.load('/assets/sounds/fx/heavy-walking-footsteps.mp3', (buffer) => {
                    this.audio.footstepSound.setBuffer(buffer);
                    this.audio.footstepSound.setRefDistance(8);   // Footsteps are close but heavy
                    this.audio.footstepSound.setMaxDistance(40);
                    this.audio.footstepSound.setRolloffFactor(1.2);
                    this.audio.footstepSound.setDistanceModel('exponential');
                    this.audio.footstepSound.setLoop(false); // Play once per step
                    this.audio.footstepSound.setVolume(2.2); // Louder footsteps
                    this.audio.footstepLoaded = true;
                    console.log('Heavy walking footstep sound loaded');
                }, undefined, (error) => {
                    console.error('Error loading heavy walking footstep sound:', error);
                });
            // Track if footsteps are paused due to zoom effect
            this.footstepsPausedForZoom = false;

                // Listen for zoom effect events to pause/resume footsteps
                if (typeof window !== 'undefined') {
                    window.addEventListener('zoomEffectActive', (e) => {
                        this.footstepsPausedForZoom = !!(e && e.detail && e.detail.active);
                        if (this.footstepsPausedForZoom && this.audio.footstepSound && this.audio.footstepSound.isPlaying) {
                            this.audio.footstepSound.pause && this.audio.footstepSound.pause();
                        }
                    });
                }
        audioLoader.load('/assets/sounds/fx/wailing-creature.mp3', (buffer) => {
            this.audio.wailingSound.setBuffer(buffer);
            this.audio.wailingSound.setRefDistance(10);   // Distance at which volume is 100%
            this.audio.wailingSound.setMaxDistance(80);   // Distance at which sound fades to silence
            this.audio.wailingSound.setRolloffFactor(1.5); // How quickly sound fades with distance
            this.audio.wailingSound.setDistanceModel('exponential');
            this.audio.wailingSound.setLoop(true);
            this.audio.wailingSound.setVolume(0.8);
            console.log('Enemy wailing sound loaded successfully');
        }, (progress) => {
            console.log('Loading wailing sound:', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        }, (error) => {
            console.error('Error loading wailing sound:', error);
        });
        
        // Load monster growl for alert sound (separate from wailing)
        audioLoader.load('/assets/sounds/fx/monster-growl.mp3', (buffer) => {
            this.alertSound.setBuffer(buffer);
            this.alertSound.setRefDistance(20);   // Loud - can be heard from distance
            this.alertSound.setMaxDistance(120);  // Very far reaching warning
            this.alertSound.setRolloffFactor(0.8);
            this.alertSound.setDistanceModel('exponential');
            this.alertSound.setLoop(false);       // Play once
            this.alertSound.setVolume(1.2);       // Loud alert
            this.alertSoundLoaded = true;
            console.log('Monster growl alert sound loaded');
        }, undefined, (error) => {
            console.error('Error loading monster growl:', error);
        });
        
        // Attach audio to the mesh so it follows the enemy
        this.mesh.add(this.audio.wailingSound);
        this.mesh.add(this.audio.footstepSound);
        this.mesh.add(this.alertSound);
        
        // Create non-positional audio for tension/chase music (plays at full volume regardless of distance)
        this.audio.tensionSound = new THREE.Audio(this.audioListener);
        audioLoader.load('/assets/sounds/amp-tension.mp3', (buffer) => {
            this.audio.tensionSound.setBuffer(buffer);
            this.audio.tensionSound.setLoop(true);
            this.audio.tensionSound.setVolume(0.5);
            console.log('Tension sound loaded successfully');
        }, undefined, (error) => {
            console.error('Error loading tension sound:', error);
        });
    }

    loadSkeletonModel() {
        const loader = new GLTFLoader();
        
        // Load the skeleton model
        loader.load('/assets/models/Skeleton/Skeleton.gltf', (gltf) => {
            this.skeletonModel = gltf.scene;
            
            // Scale the skeleton - 2x bigger than before (4.8 = 2.4 * 2)
            this.skeletonModel.scale.set(4.8, 4.8, 4.8);
            this.skeletonModel.position.y = -7; // Ground level for crawling
            
            // No rotation needed - model faces correct direction
            
            // Fix WebGPU index buffer issues by rebuilding geometry indices
            this.skeletonModel.traverse((child) => {
                if (child.isMesh) {
                    child.frustumCulled = false;
                    
                    // Fix index buffer for WebGPU compatibility
                    if (child.geometry && child.geometry.index) {
                        const oldIndex = child.geometry.index;
                        const indexArray = oldIndex.array;
                        
                        // Create a new properly-sized Uint32Array index buffer
                        const newIndexArray = new Uint32Array(indexArray.length);
                        for (let i = 0; i < indexArray.length; i++) {
                            newIndexArray[i] = indexArray[i];
                        }
                        
                        // Replace the index buffer with the fixed one
                        child.geometry.setIndex(new THREE.BufferAttribute(newIndexArray, 1));
                    }
                    
                    // Use simpler material for performance
                    if (child.material) {
                        child.material.side = THREE.FrontSide;
                    }
                }
            });
            
            this.mesh.add(this.skeletonModel);
            
            // Add glowing red eyes to the skeleton head
            this.addGlowingEyes();
            
            // Try to load animations
            this.loadAnimations(loader, gltf);
            
        }, undefined, (error) => {
            console.error('Error loading skeleton model:', error);
            // Fallback to simple mesh if model fails to load
            this.createFallbackMesh();
            // Still resolve ready so game doesn't hang
            if (this._resolveReady) this._resolveReady();
        });
    }
    
    loadAnimations(loader, skeletonGltf) {
        // Create animation mixer on the skeleton model
        this.mixer = new THREE.AnimationMixer(this.skeletonModel);
        this.attackAction = null;
        
        let crawlLoaded = false;
        let attackLoaded = false;
        
        const checkReady = () => {
            if (crawlLoaded && attackLoaded) {
                console.log('All animations loaded!');
                if (this._resolveReady) this._resolveReady();
            }
        };
        
        // Load the zombie crawl animation
        loader.load('/assets/animations/ZombieCrawlAnimation/26c3a332-36ca-491c-89f8-0fd28a98ffec.gltf', (animGltf) => {
            if (!this.skeletonModel) return;
            
            const animations = animGltf.animations;
            if (!animations || animations.length === 0) {
                console.warn('No animations found in crawl animation file');
                crawlLoaded = true;
                checkReady();
                return;
            }
            
            // Find the crawl animation (skip T-Pose if present)
            let crawlAnim = null;
            for (const anim of animations) {
                if (!anim.name.includes('T-Pose')) {
                    crawlAnim = anim;
                    break;
                }
            }
            
            // Use second animation if first is T-Pose, else use first
            if (!crawlAnim) {
                crawlAnim = animations.length > 1 ? animations[1] : animations[0];
            }
            
            if (crawlAnim) {
                // Remove root motion (translation tracks) to prevent jumping on loop
                const filteredTracks = crawlAnim.tracks.filter(track => {
                    const isRootTranslation = track.name.includes('.position') && 
                        (track.name.includes('Hips') || track.name.includes('Root') || track.name.includes('Armature'));
                    return !isRootTranslation;
                });
                
                const inPlaceClip = new THREE.AnimationClip(
                    crawlAnim.name + '_InPlace',
                    crawlAnim.duration,
                    filteredTracks
                );
                
                this.crawlAction = this.mixer.clipAction(inPlaceClip);
                this.crawlAction.setLoop(THREE.LoopRepeat, Infinity);
                this.crawlAction.clampWhenFinished = false;
                this.crawlAction.play();
                console.log('Crawl animation loaded:', inPlaceClip.name);
            }
            
            crawlLoaded = true;
            checkReady();
            
        }, undefined, (error) => {
            console.error('Error loading crawl animation:', error);
            crawlLoaded = true;
            checkReady();
        });
        
        // Load the zombie attack animation
        loader.load('/assets/animations/ZombieCrawlAttack/5a4433d2-a4f5-47c3-bfc2-2d6aaf8b0ff5.gltf', (animGltf) => {
            if (!this.skeletonModel || !this.mixer) {
                attackLoaded = true;
                checkReady();
                return;
            }
            
            const animations = animGltf.animations;
            if (!animations || animations.length === 0) {
                console.warn('No animations found in attack animation file');
                attackLoaded = true;
                checkReady();
                return;
            }
            
            // Find the attack animation (skip T-Pose if present)
            let attackAnim = null;
            for (const anim of animations) {
                if (!anim.name.includes('T-Pose')) {
                    attackAnim = anim;
                    break;
                }
            }
            
            if (!attackAnim) {
                attackAnim = animations.length > 1 ? animations[1] : animations[0];
            }
            
            if (attackAnim) {
                // Remove root motion from attack animation too
                const filteredTracks = attackAnim.tracks.filter(track => {
                    const isRootTranslation = track.name.includes('.position') && 
                        (track.name.includes('Hips') || track.name.includes('Root') || track.name.includes('Armature'));
                    return !isRootTranslation;
                });
                
                const attackClip = new THREE.AnimationClip(
                    attackAnim.name + '_Attack',
                    attackAnim.duration,
                    filteredTracks
                );
                
                this.attackAction = this.mixer.clipAction(attackClip);
                this.attackAction.setLoop(THREE.LoopOnce, 1);
                this.attackAction.clampWhenFinished = false; // Don't clamp - let it finish cleanly
                
                // Store attack duration for manual end detection
                this.attackDuration = attackClip.duration;
                
                console.log('Attack animation loaded:', attackClip.name, 'duration:', attackClip.duration, 'tracks:', filteredTracks.length);
            }
            
            attackLoaded = true;
            checkReady();
            
        }, undefined, (error) => {
            console.error('Error loading attack animation:', error);
            attackLoaded = true;
            checkReady();
        });
    }
    
    startAttack() {
        // Check cooldown first
        if (this.attackData.timer > 0) {
            return false; // Still on cooldown
        }
        if (this.attackData.isAttacking) {
            return false;
        }
        if (!this.attackAction) {
            console.warn('Attack action not loaded yet');
            return false;
        }
        
        console.log('Starting attack animation!');
        this.attackData.isAttacking = true;
        this.attackData.animTimer = 0; // Track animation progress
        
        // Crossfade from crawl to attack
        if (this.crawlAction) {
            this.crawlAction.fadeOut(0.15);
        }
        
        this.attackAction.reset();
        this.attackAction.setEffectiveWeight(1);
        this.attackAction.fadeIn(0.15);
        this.attackAction.play();
        
        return true;
    }
    
    onAttackAnimationEnd() {
        console.log('Attack animation ended, setting cooldown to', this.attackData.cooldown);
        this.attackData.isAttacking = false;
        this.attackData.timer = this.attackData.cooldown; // Set cooldown
        this.attackData.animTimer = 0;
        this.attackData.justEnded = true; // Used to trigger hit-miss sound in main loop
        // Instantly resume crawl animation to avoid T-pose
        if (this.attackAction) {
            this.attackAction.stop();
        }
        if (this.crawlAction) {
            this.crawlAction.reset();
            this.crawlAction.setEffectiveWeight(1);
            this.crawlAction.play();
        }
    }
    
    updateAttackAnimation(delta) {
        // Update cooldown timer
        if (this.attackData.timer > 0) {
            this.attackData.timer -= delta;
        }
        
        // Handle attack animation timing manually since 'finished' event can be unreliable
        if (this.attackData.isAttacking && this.attackDuration) {
            this.attackData.animTimer = (this.attackData.animTimer || 0) + delta;
            
            // Debug: log every ~0.5 seconds during attack
            if (Math.floor(this.attackData.animTimer * 2) !== Math.floor((this.attackData.animTimer - delta) * 2)) {
                console.log('Attack anim progress:', this.attackData.animTimer.toFixed(2), '/', this.attackDuration.toFixed(2),
                    'attackAction running:', this.attackAction?.isRunning(),
                    'weight:', this.attackAction?.getEffectiveWeight());
            }
            
            // End attack when animation duration is reached
            if (this.attackData.animTimer >= this.attackDuration) {
                this.onAttackAnimationEnd();
            }
        }
    }

    addGlowingEyes() {
        if (!this.skeletonModel) return;
        
        // Find the head bone to attach eyes to (so they follow animation)
        let headBone = null;
        this.skeletonModel.traverse((child) => {
            if (child.isBone) {
                const name = child.name.toLowerCase();
                // Look for head-related bone names
                if (name.includes('head') || name.includes('skull') || name.includes('neck')) {
                    if (!headBone || name.includes('head')) {
                        headBone = child;
                        console.log('Found head bone:', child.name);
                    }
                }
            }
        });
        
        // Create glowing eye spheres with emissive material for glow effect
        const eyeGeometry = new THREE.SphereGeometry(0.015, 8, 8);
        
        // Create emissive materials for different states
        this.eyeMaterials = {
            idle: new THREE.MeshBasicMaterial({ 
                color: 0x330000,
                transparent: true,
                opacity: 1.0
            }),
            alert: new THREE.MeshBasicMaterial({ 
                color: 0xAA0000,
                transparent: true,
                opacity: 1.0
            }),
            chase: new THREE.MeshBasicMaterial({ 
                color: 0xFF2200,
                transparent: true,
                opacity: 1.0
            })
        };
        
        const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        
        // Add point light for eye glow (attached to one eye)
        this.eyeGlow = new THREE.PointLight(0xFF0000, 0, 3);
        leftEye.add(this.eyeGlow);
        
        if (headBone) {
            // Attach eyes to the head bone so they follow animation
            // Position relative to head bone (need to find eye socket positions)
            // These values are in bone-local space
            leftEye.position.set(0.02, 0.06, 0.04);
            rightEye.position.set(-0.02, 0.06, 0.04);
            
            headBone.add(leftEye);
            headBone.add(rightEye);
            
            console.log('Eyes attached to head bone:', headBone.name);
        } else {
            // Fallback: attach to model root if no head bone found
            // Try to find approximate head position in the mesh
            console.log('No head bone found, attaching eyes to model root');
            leftEye.position.set(-0.03, 0.85, 0.08);
            rightEye.position.set(0.03, 0.85, 0.08);
            
            this.skeletonModel.add(leftEye);
            this.skeletonModel.add(rightEye);
        }
        
        this.eyes = [leftEye, rightEye];
    }

    createFallbackMesh() {
        // Fallback mesh in case skeleton model fails to load
        const group = new THREE.Group();

        // Body - simplified for performance
        const bodyGeometry = new THREE.CapsuleGeometry(0.6, 1.6, 4, 8);
        const bodyMaterial = new THREE.MeshBasicMaterial({
            color: 0x2a2a2a
        });
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(bodyMesh);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: 0x3a3a3a
        });
        const headMesh = new THREE.Mesh(headGeometry, headMaterial);
        headMesh.position.y = 1.0;
        group.add(headMesh);

        // Create eye materials for fallback
        this.eyeMaterials = {
            idle: new THREE.MeshBasicMaterial({ color: 0x330000 }),
            alert: new THREE.MeshBasicMaterial({ color: 0xAA0000 }),
            chase: new THREE.MeshBasicMaterial({ color: 0xFF2200 })
        };

        // Eyes - glow when active
        const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);

        const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        leftEye.position.set(-0.2, 1.1, 0.45);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        rightEye.position.set(0.2, 1.1, 0.45);
        group.add(rightEye);
        
        // Add eye glow light
        this.eyeGlow = new THREE.PointLight(0xFF0000, 0.5, 3);
        leftEye.add(this.eyeGlow);

        this.eyes = [leftEye, rightEye];
        
        this.mesh.add(group);
    }

    createMesh() {
        // Legacy method - no longer used, replaced by loadSkeletonModel
        const group = new THREE.Group();

        // Body - simplified for performance
        const bodyGeometry = new THREE.CapsuleGeometry(0.6, 1.6, 4, 8);
        const bodyMaterial = new THREE.MeshBasicMaterial({
            color: 0x2a2a2a
        });
        const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(bodyMesh);

        // Head
        const headGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const headMaterial = new THREE.MeshBasicMaterial({
            color: 0x3a3a3a
        });
        const headMesh = new THREE.Mesh(headGeometry, headMaterial);
        headMesh.position.y = 1.0;
        group.add(headMesh);

        // Eyes - glow when active
        const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
        this.eyeMaterials = {
            idle: new THREE.MeshBasicMaterial({ color: 0x330000 }),
            alert: new THREE.MeshBasicMaterial({ color: 0xAA0000 }),
            chase: new THREE.MeshBasicMaterial({ color: 0xFF4444 })
        };

        const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        leftEye.position.set(-0.2, 1.1, 0.45);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterials.idle);
        rightEye.position.set(0.2, 1.1, 0.45);
        group.add(rightEye);

        this.eyes = [leftEye, rightEye];

        // Vision wedge helper - shows the 2D horizontal cone where the AI can see
        // This matches the actual raycast behavior (horizontal rays in facing direction)
        // COMMENTED OUT FOR NOW - vision cone helper hidden
        
        const wedgeLength = this.detection?.sightRange || 50;
        const wedgeAngle = this.detection?.sightAngle || Math.PI * 0.7;
        
        // Create a 2D wedge/sector shape in XY plane (will be rotated to XZ)
        // ShapeGeometry works in XY, so we use X for left/right and Y for forward
        const wedgeShape = new THREE.Shape();
        wedgeShape.moveTo(0, 0); // Start at AI position
        
        // Draw arc for the vision cone
        const segments = 24;
        const halfAngle = wedgeAngle * 0.5;
        for (let i = 0; i <= segments; i++) {
            const angle = -halfAngle + (i / segments) * wedgeAngle;
            // X = sin(angle) for left/right spread, Y = cos(angle) for forward distance
            const x = Math.sin(angle) * wedgeLength;
            const y = Math.cos(angle) * wedgeLength;
            wedgeShape.lineTo(x, y);
        }
        wedgeShape.lineTo(0, 0); // Close the shape
        
        const wedgeGeometry = new THREE.ShapeGeometry(wedgeShape);
        const wedgeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.visionCone = new THREE.Mesh(wedgeGeometry, wedgeMaterial);
        // Rotate to lie flat on the ground (XZ plane) - rotate around X axis
        // +Math.PI/2 makes Y become +Z (forward direction)
        this.visionCone.rotation.x = Math.PI / 2;
        this.visionCone.position.set(0, 0.15, 0); // Near ground level to match raycast
        group.add(this.visionCone);
        

        return group;
    }

    generatePatrolPoints() {
        const points = [];
        const center = this.position.clone();
        const radius = 12;

        // Generate 6 patrol points in a rough circle
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const point = new THREE.Vector3(
                center.x + Math.cos(angle) * radius,
                center.y,
                center.z + Math.sin(angle) * radius
            );
            points.push(point);
        }

        return points;
    }

    update(delta, playerPos, playerState = {}) {
        // Store player position and state for use in movement
        // Store player position - reuse existing vector if possible
        if (!this.playerPosition) {
            this.playerPosition = playerPos.clone();
        } else {
            this.playerPosition.copy(playerPos);
        }
        this.playerState = {
            isMoving: playerState.isMoving || false,
            isCrouching: playerState.isCrouching || false,
            isRunning: playerState.isRunning || false,
            flashlightOn: playerState.flashlightOn || false
        };
        this.lastDelta = delta;
        this.samplePlayerVelocity(delta, playerPos);
        this.recordBreadcrumb(playerPos);

        this.updateTimers(delta);
        this.updateVision(playerPos, delta);
        this.updateState(playerPos);
        this.updateMovement(delta);
        this.updateVisuals();
        this.updateAudio(delta);
        this.updateAnimation(delta);
        
        // Check for player collision and return push vector if needed
        return this.checkPlayerCollision(playerPos);
    }
    
    updateAnimation(delta) {
        if (!this.mixer) return;
        
        // Update attack animation timing
        this.updateAttackAnimation(delta);
        
        // Don't adjust crawl speed while attacking
        if (this.attackData.isAttacking) {
            this.mixer.update(delta);
            return;
        }
        
        if (!this.crawlAction) return;
        
        // Determine target animation speed based on state
        let targetTimeScale = 1.0;
        
        if (this.currentState === this.states.ALERT) {
            // Freeze animation during alert (skeleton stops and stares)
            targetTimeScale = 0.0;
        } else if (this.currentState === this.states.CHASE) {
            // Much faster animation when chasing - frantic crawling
            targetTimeScale = 1.8;
        } else if (this.currentState === this.states.INVESTIGATE || 
                   this.currentState === this.states.SEARCH) {
            // Normal speed when investigating/searching
            targetTimeScale = 1.0;
        } else {
            // Slower animation when patrolling/returning
            targetTimeScale = 0.7;
        }
        
        // Smoothly interpolate timeScale for smooth transitions
        const currentTimeScale = this.crawlAction.timeScale;
        const lerpSpeed = 3.0; // How fast to transition (higher = faster)
        const newTimeScale = THREE.MathUtils.lerp(currentTimeScale, targetTimeScale, delta * lerpSpeed);
        
        this.crawlAction.timeScale = newTimeScale;
        
        // Update the mixer
        this.mixer.update(delta);
    }
    
    checkPlayerCollision(playerPos) {
        // Check if player is too close to the AI (collision)
        _toPlayer.copy(playerPos).sub(this.position);
        const horizontalDist = Math.sqrt(_toPlayer.x * _toPlayer.x + _toPlayer.z * _toPlayer.z);
        const verticalDist = Math.abs(_toPlayer.y);
        
        // Collision radius - AI capsule radius + player radius + buffer
        // Larger radius prevents skeleton head from clipping through player
        const collisionRadius = 3.5;
        const verticalThreshold = 3.0; // Allow some vertical leeway
        
        // Check for attack range (slightly larger than collision)
        const attackRange = this.attackData.range;
        const inAttackRange = horizontalDist < attackRange && verticalDist < verticalThreshold;
        
        // Debug: Log when player is close
        if (horizontalDist < 5) {
            console.log('Close to player:', {
                horizontalDist: horizontalDist.toFixed(2),
                verticalDist: verticalDist.toFixed(2),
                attackRange,
                inAttackRange,
                state: this.currentState,
                isChase: this.currentState === this.states.CHASE,
                isAttacking: this.attackData.isAttacking,
                cooldown: this.attackData.timer.toFixed(2),
                hasAttackAction: !!this.attackAction
            });
        }
        
        // Trigger attack if in range and chasing
        if (inAttackRange && this.currentState === this.states.CHASE && !this.attackData.isAttacking) {
            console.log('ATTACK CONDITIONS MET! Starting attack...');
            if (this.startAttack()) {
                // Attack started - return knockback
                _tempVec1.set(_toPlayer.x, 0, _toPlayer.z).normalize();
                
                // Strong knockback on attack hit
                const knockback = this.attackData.knockbackStrength;
                
                // Add slight upward force for impact feel
                _tempVec1.y = 0.3;
                _tempVec1.normalize();
                
                return {
                    push: _tempVec1.multiplyScalar(knockback),
                    colliding: true,
                    isAttack: true,
                    damage: this.attackData.damage
                };
            }
        }
        
        // Regular collision (no attack)
        if (horizontalDist < collisionRadius && verticalDist < verticalThreshold) {
            // Player is colliding with AI - calculate push direction
            if (horizontalDist > 0.1) {
                _tempVec1.set(_toPlayer.x, 0, _toPlayer.z).normalize();
            } else {
                _tempVec1.copy(this.facingDirection);
            }
            
            // Push strength based on how close they are
            const pushStrength = (collisionRadius - horizontalDist) * 15;
            
            // If player is above, also push them up slightly
            if (_toPlayer.y > 0.5) {
                _tempVec1.y = 0.5;
                _tempVec1.normalize();
            }
            
            return {
                push: _tempVec1.multiplyScalar(pushStrength),
                colliding: true,
                isAttack: false
            };
        }
        
        return { push: null, colliding: false, isAttack: false };
    }

    updateTimers(delta) {
        this.timers.stateChange += delta;
        this.timers.stuck += delta;
        this.timers.lastRaycast += delta;

        if (this.currentState === this.states.INVESTIGATE) {
            this.timers.investigation += delta;
            this.timers.search = 0;
        } else if (this.currentState === this.states.SEARCH) {
            this.timers.search += delta;
            this.timers.investigation = 0;
        } else {
            this.timers.investigation = 0;
            this.timers.search = 0;
        }

        this.timers.breadcrumbs += delta;
    }

    samplePlayerVelocity(delta, playerPos) {
        if (!this.lastPlayerSample) {
            this.lastPlayerSample = playerPos.clone();
            return;
        }

        // Reuse temp vector instead of clone
        _tempVec1.copy(playerPos).sub(this.lastPlayerSample);
        if (delta > 0) {
            _tempVec1.divideScalar(delta);
            this.playerVelocity.copy(_tempVec1);
        }

        this.lastPlayerSample.copy(playerPos);
    }

    recordBreadcrumb(playerPos) {
        if (this.timers.breadcrumbs < 0.25) return; // Record more frequently

        const distance = this.position.distanceTo(playerPos);
        if (distance > this.detection.chaseRange) return;

        this.timers.breadcrumbs = 0;
        this.breadcrumbs.push(playerPos.clone());
        if (this.breadcrumbs.length > this.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }

    updateVision(playerPos, delta) {
        const distance = this.position.distanceTo(playerPos);
        this.heardPlayer = false;

        // Reuse temp vectors instead of cloning
        _toPlayer.copy(playerPos).sub(this.position);
        _toPlayer.y = 0;
        const toPlayerLen = _toPlayer.length();
        const withinDistance = toPlayerLen <= this.detection.sightRange;
        const effectiveFov = this.currentState === this.states.CHASE ? Math.PI : this.detection.sightAngle;
        
        if (toPlayerLen > 0) {
            _playerDir.copy(_toPlayer).divideScalar(toPlayerLen);
        } else {
            _playerDir.set(0, 0, 0);
        }
        
        if (this.filteredFacing.lengthSq() > 0) {
            _facing.copy(this.filteredFacing).normalize();
        } else {
            _facing.set(1, 0, 0);
        }
        
        const angle = Math.acos(THREE.MathUtils.clamp(_facing.dot(_playerDir), -1, 1));
        const withinFov = angle <= effectiveFov * 0.5 || toPlayerLen < 8;

        // Only update canSeePlayer when raycast timer allows - preserve previous value otherwise
        if (this.timers.lastRaycast > 0.15) {
            this.timers.lastRaycast = 0;
            
            if (withinDistance && withinFov) {
                this.canSeePlayer = this.checkLineOfSight(playerPos);
            } else {
                this.canSeePlayer = false;
            }
        }

        // Hearing check - based on player noise level
        // AI can hear player even if it can see them (useful for state transitions)
        const noiseLevel = this.calculatePlayerNoise();
        // Make AI more sensitive to sound while actively investigating/searching
        const hearingStateMultiplier = (this.currentState === this.states.INVESTIGATE || this.currentState === this.states.SEARCH) ? 1.4 : 1.0;
        const effectiveHearingRange = this.detection.hearingRange * noiseLevel * hearingStateMultiplier;
        
        if (distance <= effectiveHearingRange && noiseLevel > 0) {
            this.heardPlayer = true;
            if (!this.lastHeardPosition) {
                this.lastHeardPosition = playerPos.clone();
            } else {
                this.lastHeardPosition.copy(playerPos);
            }
            this.lastHeardNoiseLevel = noiseLevel;
            
            // Debug: log when AI hears player
            if (noiseLevel > 1.0) {
                console.log('AI heard loud noise! Level:', noiseLevel.toFixed(2), 'Distance:', distance.toFixed(1));
            }
        } else {
            this.heardPlayer = false;
        }

        if (this.canSeePlayer) {
            this.occlusionTime = 0;
        } else {
            this.occlusionTime += delta;
        }
    }

    calculatePlayerNoise() {
        // Base noise level - 0 means silent, 1 means normal, >1 means loud
        let noiseLevel = 0;
        
        if (!this.playerState) return 0;
        
        // Flashlight toggle makes a loud click sound!
        if (this.playerState.flashlightToggled) {
            // Immediate loud noise when toggling flashlight
            this.heardFlashlightClick = true;
            return 2.5; // Very loud click - AI will definitely hear this
        }
        
        // Movement noise
        if (this.playerState.isMoving) {
            if (this.playerState.isRunning) {
                // Running is VERY loud - footsteps, rustling, breathing
                noiseLevel = 1.5;
            } else if (this.playerState.isCrouching) {
                // Crouch-walking is quiet but not silent
                noiseLevel = 0.4;
            } else {
                // Normal walking - moderately loud (increase so walking is more audible)
                noiseLevel = 1.1;
            }
        } else {
            // Standing still
            if (this.playerState.isCrouching) {
                // Crouched and still - very quiet
                noiseLevel = 0.1;
            } else {
                // Standing still - slight ambient noise (breathing, shifting)
                noiseLevel = 0.2;
            }
        }
        
        // Flashlight being on adds slight continuous noise (electrical hum, player more visible)
        if (this.playerState.flashlightOn) {
            noiseLevel += 0.3;
        }
        
        return noiseLevel;
    }

    checkLineOfSight(targetPos) {
        _toPlayer.copy(targetPos).sub(this.position);
        // Use horizontal distance for falloff/fov checks so vertical offsets don't help hide
        const horizToPlayer = _toPlayer.clone();
        horizToPlayer.y = 0;
        const distance = horizToPlayer.length();

        // Very close - can always see (increased range for better close detection)
        if (distance < 3.0) return true;

        // Make detection harder at distance
        const maxSight = this.detection.sightRange;
        if (distance > maxSight) return false;
        // Cubic detection falloff: extremely unlikely to detect at distance
        let detectionChance = 1 - Math.pow(distance / maxSight, 3); // 1.0 (close) to 0.0 (far)
        detectionChance = Math.min(detectionChance, 0.5); // Never higher than 0.5 at max range
        if (Math.random() > detectionChance) return false;

        // Get the AI's actual facing direction (not toward player)
        if (this.filteredFacing.lengthSq() > 0) {
            _facing.copy(this.filteredFacing).normalize();
        } else {
            _facing.set(1, 0, 0);
        }

        // Ray origin at an eye height (configurable) and slightly in front to avoid self-collision
        const eyeHeight = (this._visionEyeHeight !== undefined) ? this._visionEyeHeight : 1.2;
        const offsetX = _facing.x * 0.7;
        const offsetZ = _facing.z * 0.7;
        this._losRayOrigin.x = this.position.x + offsetX;
        this._losRayOrigin.y = this.position.y + eyeHeight;
        this._losRayOrigin.z = this.position.z + offsetZ;

        // Cast rays in a cone in front of the AI's face (in facing direction)
        const halfFov = this.detection.sightAngle * 0.5;
        const numRays = 3; // a small fan to cover the cone

        for (let i = 0; i < numRays; i++) {
            // Spread rays evenly across the FOV cone
            const t = numRays > 1 ? i / (numRays - 1) : 0.5;
            const coneAngle = -halfFov + t * (halfFov * 2);

            // Start with a direction toward the player's actual position (includes vertical component)
            _tempVec1.copy(targetPos).sub(this._losRayOrigin).normalize();
            // Rotate that direction around the world up axis to sweep the cone
            _tempVec1.applyAxisAngle(WORLD_UP, coneAngle);

            this._losRayDir.x = _tempVec1.x;
            this._losRayDir.y = _tempVec1.y;
            this._losRayDir.z = _tempVec1.z;

            const ray = new this.RAPIER.Ray(this._losRayOrigin, this._losRayDir);
            const hit = this.world.castRay(ray, this.detection.sightRange, true);

            if (hit) {
                const hitBody = hit.collider.parent();

                // Hit ourselves - ignore
                if (hitBody === this.body) {
                    continue;
                }

                // Hit the player - we can see them!
                if (hitBody === this.characterBody) {
                    // Debug log occasionally
                    if (Math.random() < 0.02) console.log(`LOS: ray hit player (dist ${distance.toFixed(2)}, originY ${this._losRayOrigin.y.toFixed(2)})`);
                    return true;
                }
            }
            // No hit or hit an obstacle - check next ray
        }

        // None of the rays in our vision cone hit the player
        if (this._lastLosDebugTime === undefined) this._lastLosDebugTime = 0;
        const now = performance ? performance.now() : Date.now();
        if (now - this._lastLosDebugTime > 1000) {
            this._lastLosDebugTime = now;
            // occasional coarse debug so we don't spam console
            // console.log('LOS: no ray hit player');
        }

        return false;
    }

    updateState(playerPos) {
        const delta = this.lastDelta || 0.016;
        const distance = this.position.distanceTo(playerPos);
        if (!this.memory.lastSeenPosition && this.breadcrumbs.length > 0) {
            this.memory.lastSeenPosition = this.breadcrumbs[this.breadcrumbs.length - 1].clone();
        }

        switch (this.currentState) {
            case this.states.PATROL:
                if (this.canSeePlayer) {
                    // Saw player - go to alert first (gives player warning)
                    this.alertData.targetPosition = playerPos.clone();
                    this.alertData.wasFromSight = true;
                    this.changeState(this.states.ALERT);
                    this.memory.lastSeenPosition = playerPos.clone();
                    this.memory.lastSeenTime = 0;
                } else if (this.heardPlayer) {
                    // Heard player - go to alert first
                    this.alertData.targetPosition = playerPos.clone();
                    this.alertData.wasFromSight = false;
                    this.changeState(this.states.ALERT);
                    this.memory.investigationPoints.push(playerPos.clone());
                }
                break;

            case this.states.ALERT:
                // Update alert timer
                this.timers.alert += delta;
                
                // Play alert sound once at start
                if (!this.alertData.soundPlayed && this.alertSoundLoaded && this.alertSound) {
                    if (!this.alertSound.isPlaying) {
                        this.alertSound.play();
                        console.log('ALERT: Playing warning sound!');
                    }
                    this.alertData.soundPlayed = true;
                }
                
                // Look at the target position during alert
                if (this.alertData.targetPosition) {
                    const toTarget = this.alertData.targetPosition.clone().sub(this.position);
                    toTarget.y = 0;
                    if (toTarget.lengthSq() > 0.01) {
                        this.facingDirection.copy(toTarget.normalize());
                    }
                }
                
                // After alert duration, transition to CHASE (heard or seen = chase)
                if (this.timers.alert >= this.alertData.duration) {
                    console.log('ALERT: Finished - chasing player!');
                    this.changeState(this.states.CHASE);
                    this.memory.lastSeenPosition = playerPos.clone();
                }
                break;

            case this.states.INVESTIGATE:
                // Always check for player first - can switch to chase immediately
                if (this.canSeePlayer) {
                    console.log('INVESTIGATE: Spotted player, switching to CHASE');
                    this.changeState(this.states.CHASE);
                    this.memory.lastSeenPosition = playerPos.clone();
                    this.memory.investigationPoints = []; // Clear investigation points
                    break;
                }
                
                // Timeout check - give up after 12 seconds (more persistent)
                if (this.timers.investigation > 12) {
                    console.log('INVESTIGATE: Timed out, returning home');
                    this.memory.investigationPoints = [];
                    this.changeState(this.states.RETURN);
                    break;
                }
                
                // If we're currently pausing to scan the area, handle the pause/rotation
                if (this._investigatePausing) {
                    this.timers.investigationPause = (this.timers.investigationPause || 0) + delta;
                    // Rotate in place to 'look around'
                    if (this.mesh) {
                        this.mesh.rotation.y += delta * 1.5; // rotate ~85deg/sec
                        this.filteredFacing.set(Math.sin(this.mesh.rotation.y), 0, Math.cos(this.mesh.rotation.y)).normalize();
                    }
                    if (this.timers.investigationPause >= (this._investigatePauseDuration || 2.0)) {
                        this._investigatePausing = false;
                        this.timers.investigationPause = 0;
                        // After scanning, move to next investigation point
                        if (this.memory.investigationPoints && this.memory.investigationPoints.length > 0) {
                            this.memory.investigationPoints.shift();
                        }
                    }
                    break;
                }

                // If heard player again, update investigation point (but don't reset timer)
                if (this.heardPlayer && this.memory.investigationPoints.length > 0) {
                    this.memory.investigationPoints[0] = playerPos.clone();
                }
                
                // Check if we have investigation points to go to
                if (this.memory.investigationPoints.length > 0) {
                    const targetPoint = this.memory.investigationPoints[0];
                    const distToTarget = this.position.distanceTo(targetPoint);
                    
                    // Check if reached investigation point
                    if (distToTarget < 2) {
                        console.log('INVESTIGATE: Reached investigation point, pausing to scan');
                        // Pause and scan for a short duration before moving to next point
                        this._investigatePausing = true;
                        this.timers.investigationPause = 0;
                        // If player is close, immediately switch to CHASE
                        if (distance < 8) {
                            console.log('INVESTIGATE: Player nearby, switching to CHASE');
                            this.changeState(this.states.CHASE);
                            this.memory.lastSeenPosition = playerPos.clone();
                            this.memory.investigationPoints = [];
                        }
                    }
                } else {
                    // No investigation points - shouldn't happen but handle it
                    console.log('INVESTIGATE: No investigation points, searching');
                    this.changeState(this.states.SEARCH);
                }
                break;

            case this.states.CHASE:
                // Update last seen position when we can see player
                if (this.canSeePlayer) {
                    this.memory.lastSeenPosition = playerPos.clone();
                    this.memory.lastSeenTime = 0;
                } else {
                    // Track how long since we last saw the player
                    this.memory.lastSeenTime += this.lastDelta || 0.016;
                }
                
                const chaseDistance = this.position.distanceTo(playerPos);
                const distToLastSeen = this.memory.lastSeenPosition 
                    ? this.position.distanceTo(this.memory.lastSeenPosition) 
                    : chaseDistance;
                
                // Check if we're stuck at the same distance (can't reach player)
                const distanceChange = Math.abs(chaseDistance - this.stuckDetection.lastDistance);
                if (distanceChange < this.stuckDetection.threshold) {
                    this.timers.sameDistance += this.lastDelta || 0.016;
                } else {
                    // Distance changed significantly, reset timer
                    this.timers.sameDistance = 0;
                    this.stuckDetection.lastDistance = chaseDistance;
                }
                
                // If stuck at same distance for too long, give up chase
                if (this.timers.sameDistance > this.stuckDetection.timeout) {
                    console.log(`CHASE: Stuck at same distance (${chaseDistance.toFixed(1)}) for ${this.stuckDetection.timeout}s, returning home`);
                    this.timers.sameDistance = 0;
                    this.stuckDetection.lastDistance = 0;
                    this.changeState(this.states.RETURN);
                    break;
                }
                
                // Track how long the AI can see the player during chase
                if (this.canSeePlayer) {
                    this.chaseVisibleTimer += this.lastDelta || 0.016;
                } else {
                    this.chaseVisibleTimer = 0;
                }

                // If AI has seen the player for too long, start searching a new area
                if (this.chaseVisibleTimer > this.chaseVisibleTimeout) {
                    console.log('CHASE: Chased player for too long, switching to SEARCH');
                    this.chaseVisibleTimer = 0;
                    this.changeState(this.states.SEARCH);
                    break;
                }

                // If we've lost sight for 25 seconds or more, go investigate the last seen location
                if (!this.canSeePlayer && (this.memory.lastSeenTime >= 25)) {
                    console.log('CHASE: Lost sight for >=25s, switching to INVESTIGATE (timeout)');
                    if (this.memory.lastSeenPosition) {
                        this.memory.investigationPoints = [this.memory.lastSeenPosition.clone()];
                    }
                    this.changeState(this.states.INVESTIGATE);
                    break;
                }

                // Keep chasing if:
                // 1. Can see player, OR
                // 2. Player is close (within 25 units), OR
                // 3. Haven't reached last known position yet, OR
                // 4. Haven't lost sight for too long (25 seconds)
                if (this.canSeePlayer || chaseDistance < 25 || distToLastSeen > 3 || this.memory.lastSeenTime < 25) {
                    // Keep chasing toward last known position
                } else {
                    // Lost sight, reached last position, and waited long enough
                    // Transition to INVESTIGATE so the AI actively looks around the last known location
                    console.log('CHASE: Lost player for >=25s, switching to INVESTIGATE');
                    if (this.memory.lastSeenPosition) {
                        this.memory.investigationPoints = [this.memory.lastSeenPosition.clone()];
                    }
                    this.changeState(this.states.INVESTIGATE);
                }
                break;

            case this.states.SEARCH:
                if (this.canSeePlayer) {
                    this.changeState(this.states.CHASE);
                    this.memory.lastSeenPosition = playerPos.clone();
                } else if (this.heardPlayer) {
                    // Heard player while searching - update search target!
                    console.log('SEARCH: Heard player, updating search location');
                    this.memory.lastSeenPosition = playerPos.clone();
                    this.timers.search = 0; // Reset search timer - keep searching
                } else if (distance < 6) {
                    // Player is very close - they must be here, chase them!
                    console.log('SEARCH: Player very close, switching to CHASE');
                    this.changeState(this.states.CHASE);
                    this.memory.lastSeenPosition = playerPos.clone();
                } else if (this.timers.search > 15) {
                    if (this.searchAttempts < this.maxSearchAttempts) {
                        // Pick a new random patrol/search point
                        const patrolPoints = this.memory.patrolPoints || [];
                        if (patrolPoints.length > 0) {
                            const newSearchPoint = patrolPoints[Math.floor(Math.random() * patrolPoints.length)];
                            this.memory.lastSeenPosition = newSearchPoint.clone();
                            this.timers.search = 0;
                            this.searchAttempts++;
                            console.log('SEARCH: Could not find player, moving to new area');
                        } else {
                            // No patrol points, just return
                            this.changeState(this.states.RETURN);
                            this.breadcrumbs = [];
                            this.searchAttempts = 0;
                        }
                    } else {
                        this.changeState(this.states.RETURN);
                        this.breadcrumbs = [];
                        this.searchAttempts = 0;
                    }
                }
                break;

            case this.states.RETURN:
                // Always check for player first - can re-engage at any time
                if (this.canSeePlayer) {
                    console.log('RETURN: Spotted player, switching to CHASE');
                    this.changeState(this.states.CHASE);
                    this.memory.lastSeenPosition = playerPos.clone();
                } else if (this.heardPlayer && this.timers.stateChange > 2.0) {
                    // Only investigate if we haven't just come from investigate (prevents loop)
                    console.log('RETURN: Heard player, switching to INVESTIGATE');
                    this.changeState(this.states.INVESTIGATE);
                    this.memory.investigationPoints = [playerPos.clone()];
                } else if (this.position.distanceTo(this.memory.homePosition) < 3) {
                    this.changeState(this.states.PATROL);
                    this.memory.investigationPoints = []; // Clear old investigation points
                }
                break;
        }
    }

    changeState(newState) {
        if (this.currentState === newState) return;

        this.currentState = newState;
        this.timers.stateChange = 0;
        
        // Reset stuck detection when changing states
        this.timers.sameDistance = 0;
        this.stuckDetection.lastDistance = 0;

        // Reset search attempts when entering SEARCH state
        if (newState === this.states.SEARCH) {
            this.searchAttempts = 0;
        }

        // Reset relevant timers
        if (newState === this.states.ALERT) {
            this.timers.alert = 0;
            this.alertData.soundPlayed = false;
            console.log('ALERT: Enemy detected something!');
            
            // Trigger glitch effect on screen when AI detects player (only once per encounter)
            if (!this.glitchTriggeredThisEncounter) {
                if (typeof window.triggerGlitchEffect === 'function') {
                    window.triggerGlitchEffect();
                }
                // Trigger zoom effect on first encounter - pass enemy position for look-at
                if (typeof window.triggerZoomEffect === 'function') {
                    window.triggerZoomEffect(true, this.position.clone());
                }
                this.glitchTriggeredThisEncounter = true;
            }
        } else if (newState === this.states.CHASE) {
            console.log('CHASE: Enemy is now pursuing!');
            // Reset zoom when chase begins - the dramatic moment is over
            if (typeof window.triggerZoomEffect === 'function') {
                window.triggerZoomEffect(false);
            }
        } else if (newState === this.states.INVESTIGATE) {
            this.timers.investigation = 0;
            // Seed multiple investigation points around the last seen position so the AI searches a small area
            this._investigatePauseDuration = 2.0; // seconds to pause and scan at each point
            this._investigatePausing = false;
            if (this.memory.lastSeenPosition) {
                // Create a small spiral of points around lastSeenPosition
                const pts = [];
                const center = this.memory.lastSeenPosition.clone();
                const num = 6;
                for (let i = 0; i < num; i++) {
                    const a = (i / num) * Math.PI * 2;
                    const r = 2 + (i % 3); // radius between 2 and 4
                    pts.push(new THREE.Vector3(center.x + Math.cos(a) * r, center.y, center.z + Math.sin(a) * r));
                }
                this.memory.investigationPoints = pts;
            } else {
                this.memory.investigationPoints = [];
            }
        } else if (newState === this.states.SEARCH) {
            this.timers.search = 0;
        } else if (newState === this.states.RETURN) {
            // Reset glitch trigger when enemy returns to patrol - next encounter will trigger it again
            this.glitchTriggeredThisEncounter = false;
            
            // Reset zoom effect when enemy gives up
            if (typeof window.triggerZoomEffect === 'function') {
                window.triggerZoomEffect(false);
            }
        } else if (newState === this.states.PATROL) {
            // Also reset zoom when returning to patrol
            if (typeof window.triggerZoomEffect === 'function') {
                window.triggerZoomEffect(false);
            }
        }
    }

    updateMovement(delta) {
        // Stop all movement during attack animation
        if (this.attackData.isAttacking) {
            return;
        }
        
        let targetPos = null;
        let speed = this.speeds.patrol;

        switch (this.currentState) {
            case this.states.PATROL:
                targetPos = this.getNextPatrolPoint();
                speed = this.speeds.patrol;
                break;

            case this.states.ALERT:
                // Enemy stops and turns to look at the alert target
                // No movement during alert - just turning handled in updateState
                targetPos = null;
                speed = 0;
                break;

            case this.states.INVESTIGATE:
                targetPos = this.memory.investigationPoints[0] || this.memory.lastSeenPosition;
                speed = this.speeds.investigate;
                break;

            case this.states.CHASE:
                // ALWAYS chase current player position - direct pursuit!
                // The AI knows where player is through sound/proximity even if can't see
                targetPos = this.playerPosition.clone();
                speed = this.speeds.chase;
                break;

            case this.states.SEARCH:
                targetPos = this.getSearchPosition();
                speed = this.speeds.search;
                break;

            case this.states.RETURN:
                targetPos = this.memory.homePosition;
                speed = this.speeds.return;
                break;
        }

        if (targetPos) {
            this.moveToward(targetPos, speed, delta);
        }
    }

    getNextPatrolPoint() {
        // Initialize patrol index if not set
        if (this.patrolIndex === undefined) {
            this.patrolIndex = 0;
        }
        
        const currentTarget = this.memory.patrolPoints[this.patrolIndex];
        const distToTarget = this.position.distanceTo(currentTarget);
        
        // If we've reached the current patrol point, move to the next one
        if (distToTarget < 2.0) {
            this.patrolIndex = (this.patrolIndex + 1) % this.memory.patrolPoints.length;
        }
        
        return this.memory.patrolPoints[this.patrolIndex];
    }

    getSearchPosition() {
        // Search in expanding circles around last seen position
        if (!this.memory.lastSeenPosition) {
            const crumb = this.getBreadcrumbFallback();
            if (crumb) return crumb;
            return this.memory.homePosition;
        }

        if (this.breadcrumbs.length > 2) {
            const rewindIndex = Math.max(0, this.breadcrumbs.length - 1 - Math.floor(this.timers.search));
            const breadcrumb = this.breadcrumbs[rewindIndex];
            if (breadcrumb) return breadcrumb.clone();
        }

        const searchRadius = 5 + (this.timers.search * 2);
        const angle = this.timers.search * 2;

        return new THREE.Vector3(
            this.memory.lastSeenPosition.x + Math.cos(angle) * searchRadius,
            this.memory.lastSeenPosition.y,
            this.memory.lastSeenPosition.z + Math.sin(angle) * searchRadius
        );
    }

    getPlayerPosition() {
        // This will be set during the update call
        return this.playerPosition || this.memory.lastSeenPosition;
    }

    getPredictedPlayerPosition() {
        if (!this.playerPosition) return this.memory.lastSeenPosition;

        const speed = this.playerVelocity.length();
        if (speed < 2.0) {
            // For slow movement, just chase current position
            return this.playerPosition.clone();
        }

        const lead = Math.min(this.prediction.chaseLeadTime, this.prediction.maxLeadDistance / speed);
        const projected = this.playerVelocity.clone().multiplyScalar(lead);
        return this.playerPosition.clone().add(projected);
    }

    getBreadcrumbFallback() {
        if (!this.breadcrumbs.length) return null;
        return this.breadcrumbs[this.breadcrumbs.length - 1].clone();
    }

    moveToward(targetPos, speed, delta) {
        _direction.copy(targetPos).sub(this.position);
        _direction.y = 0;
        const distance = _direction.length();

        const minDistance = this.currentState === this.states.CHASE ? 2.0 : 0.5;

        if (distance < minDistance) {
            if (this.currentState === this.states.INVESTIGATE) {
                this.memory.investigationPoints.shift();
                if (this.memory.investigationPoints.length === 0) {
                    this.changeState(this.states.RETURN);
                }
            }
            if (this.currentState !== this.states.CHASE) {
                return;
            }
        }

        if (distance > 0.1) {
            _direction.normalize();

            // applySteering modifies _steeringDir
            this.applySteering(_direction, delta);
            _movement.copy(_steeringDir).multiplyScalar(speed * delta);

            // Reuse movement vector
            if (!this._movementVec) {
                this._movementVec = new this.RAPIER.Vector3(0, 0, 0);
            }
            this._movementVec.x = _movement.x;
            this._movementVec.y = 0;
            this._movementVec.z = _movement.z;
            
            this.controller.computeColliderMovement(this.collider, this._movementVec);
            const corrected = this.controller.computedMovement();

            if (corrected.x === 0 && corrected.z === 0) {
                this.handleStuck();
                return;
            }

            const currentPos = this.body.translation();
            this.position.set(
                currentPos.x + corrected.x,
                currentPos.y,
                currentPos.z + corrected.z
            );

            this.body.setNextKinematicTranslation({
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            });

            this.velocity.copy(_movement).divideScalar(Math.max(delta, 0.0001));
        } else {
            this.velocity.multiplyScalar(0.8);
        }

        this.timers.stuck = 0;
    }

    applySteering(desiredDir, delta) {
        // computeObstacleAvoidance returns _avoidance (shared)
        const avoidance = this.computeObstacleAvoidance(desiredDir);
        
        _steeringDir.copy(desiredDir);
        if (avoidance.lengthSq() > 0.001) {
            _steeringDir.addScaledVector(avoidance, this.navigation.avoidanceStrength * 2);
            _steeringDir.normalize();
        }
        
        this.facingDirection.copy(_steeringDir).normalize();
        this.filteredFacing.copy(_steeringDir).normalize();
        return _steeringDir;
    }

    computeObstacleAvoidance(desiredDir) {
        _avoidance.set(0, 0, 0);
        const samples = Math.max(1, this.navigation.obstacleSamples);
        const distance = this.navigation.obstacleCheckDistance;
        
        // Reuse ray origin
        if (!this._rayOrigin) {
            this._rayOrigin = new this.RAPIER.Vector3(0, 0, 0);
        }
        this._rayOrigin.x = this.position.x;
        this._rayOrigin.y = this.position.y + 0.6;
        this._rayOrigin.z = this.position.z;
        
        const spread = Math.PI * 0.8;

        let blockedFront = false;
        let leftClear = true;
        let rightClear = true;

        for (let i = 0; i < samples; i++) {
            const normalizedIndex = samples === 1 ? 0 : (i / (samples - 1)) - 0.5;
            const angle = normalizedIndex * spread;
            _sampleDir.copy(desiredDir).applyAxisAngle(WORLD_UP, angle).normalize();

            // Reuse ray direction
            if (!this._rayDir) {
                this._rayDir = new this.RAPIER.Vector3(0, 0, 0);
            }
            this._rayDir.x = _sampleDir.x;
            this._rayDir.y = 0;
            this._rayDir.z = _sampleDir.z;
            
            const ray = new this.RAPIER.Ray(this._rayOrigin, this._rayDir);
            const hit = this.world.castRay(ray, distance, true);

            if (hit && hit.collider.parent() !== this.characterBody && hit.collider.parent() !== this.body) {
                const toi = typeof hit.toi === 'number' ? hit.toi : distance;
                const weight = 1 - Math.min(toi / distance, 1);
                const strengthenedWeight = weight * weight * 2;
                
                _perpendicular.set(-_sampleDir.z, 0, _sampleDir.x);
                if (angle >= 0) _perpendicular.negate();
                
                _avoidance.addScaledVector(_perpendicular, strengthenedWeight);
                _avoidance.addScaledVector(_sampleDir, -strengthenedWeight * 0.5);
                
                if (Math.abs(angle) < 0.3) blockedFront = true;
                if (angle < -0.2 && toi < distance * 0.5) leftClear = false;
                if (angle > 0.2 && toi < distance * 0.5) rightClear = false;
            }
        }
        
        if (blockedFront) {
            if (leftClear && !rightClear) {
                _tempVec1.copy(desiredDir).applyAxisAngle(WORLD_UP, -Math.PI * 0.5);
                _avoidance.addScaledVector(_tempVec1, 2);
            } else if (rightClear && !leftClear) {
                _tempVec1.copy(desiredDir).applyAxisAngle(WORLD_UP, Math.PI * 0.5);
                _avoidance.addScaledVector(_tempVec1, 2);
            }
        }

        return _avoidance;
    }

    handleStuck() {
        // Initialize stuck recovery state
        if (this.stuckAttempts === undefined) {
            this.stuckAttempts = 0;
        }
        
        const delta = this.lastDelta || 0.016;
        this.stuckAttempts++;
        
        // Cycle through escape strategies
        const strategyIndex = this.stuckAttempts % 5;
        
        switch (strategyIndex) {
            case 0:
                // Strategy 1: Find clearest direction
                const clearDir = this.findClearestDirection();
                if (clearDir) {
                    _escapeDir.copy(clearDir);
                } else {
                    _escapeDir.set(-this.facingDirection.z, 0, this.facingDirection.x).normalize();
                }
                break;
            case 1:
                // Strategy 2: Perpendicular left
                _escapeDir.set(-this.facingDirection.z, 0, this.facingDirection.x).normalize();
                break;
            case 2:
                // Strategy 3: Perpendicular right
                _escapeDir.set(this.facingDirection.z, 0, -this.facingDirection.x).normalize();
                break;
            case 3:
                // Strategy 4: Backwards
                _escapeDir.copy(this.facingDirection).negate();
                break;
            default:
                // Strategy 5: Random direction
                _escapeDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        }
        
        if (_escapeDir.lengthSq() < 0.01) {
            _escapeDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        }
        
        // Directly apply escape movement
        _escapeMovement.copy(_escapeDir).multiplyScalar(this.speeds.chase * delta * 1.5);
        
        if (!this._escapeVec) {
            this._escapeVec = new this.RAPIER.Vector3(0, 0, 0);
        }
        this._escapeVec.x = _escapeMovement.x;
        this._escapeVec.y = 0;
        this._escapeVec.z = _escapeMovement.z;
        
        this.controller.computeColliderMovement(this.collider, this._escapeVec);
        const escapeCorrected = this.controller.computedMovement();
        
        if (escapeCorrected.x !== 0 || escapeCorrected.z !== 0) {
            const currentPos = this.body.translation();
            this.position.set(
                currentPos.x + escapeCorrected.x,
                currentPos.y,
                currentPos.z + escapeCorrected.z
            );
            this.body.setNextKinematicTranslation({
                x: this.position.x,
                y: this.position.y,
                z: this.position.z
            });
            this.timers.stuck = 0;
            this.stuckAttempts = 0;
        }
        
        if (this.stuckAttempts > 15) {
            this.stuckAttempts = 0;
            if (this.currentState === this.states.PATROL) {
                this.patrolIndex = ((this.patrolIndex || 0) + 1) % this.memory.patrolPoints.length;
            } else if (this.currentState !== this.states.CHASE) {
                this.changeState(this.states.RETURN);
            }
        }
    }
    
    findClearestDirection() {
        // Cast rays in a circle to find the clearest escape path
        // Reuse Rapier vectors to avoid allocations
        this._stuckRayOrigin.x = this.position.x;
        this._stuckRayOrigin.y = this.position.y + 0.6;
        this._stuckRayOrigin.z = this.position.z;
        const numRays = 16;
        const checkDistance = 8;
        
        let bestScore = 0;
        let bestAngle = 0;
        
        for (let i = 0; i < numRays; i++) {
            const angle = (i / numRays) * Math.PI * 2;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            
            this._stuckRayDir.x = sinA;
            this._stuckRayDir.y = 0;
            this._stuckRayDir.z = cosA;
            const ray = new this.RAPIER.Ray(this._stuckRayOrigin, this._stuckRayDir);
            const hit = this.world.castRay(ray, checkDistance, true);
            
            let clearDistance = checkDistance;
            if (hit && hit.collider.parent() !== this.characterBody && hit.collider.parent() !== this.body) {
                clearDistance = typeof hit.toi === 'number' ? hit.toi : checkDistance;
            }
            
            // Prefer directions that are somewhat toward our goal (if we have one)
            let directionBonus = 0;
            if (this.playerPosition && this.currentState === this.states.CHASE) {
                _clearDir.set(sinA, 0, cosA);
                _toPlayer.copy(this.playerPosition).sub(this.position).normalize();
                directionBonus = _clearDir.dot(_toPlayer) * 2; // Bonus for moving toward player
            }
            
            const score = clearDistance + directionBonus;
            
            if (score > bestScore) {
                bestScore = score;
                bestAngle = angle;
            }
        }
        
        // Only return a direction if it's reasonably clear
        if (bestScore > 3) {
            _clearDir.set(Math.sin(bestAngle), 0, Math.cos(bestAngle));
            return _clearDir;
        }
        return null;
    }

    updateVisuals() {
        this.mesh.position.copy(this.position);

        // Update mesh rotation to face the movement/facing direction using atan2
        // Use smoothing to prevent rapid oscillation
        if (this.facingDirection.lengthSq() > 0.001) {
            // Calculate target rotation angle from facing direction
            const targetAngle = Math.atan2(this.facingDirection.x, this.facingDirection.z);

            // Smoothly interpolate current rotation to target rotation
            let currentAngle = this.mesh.rotation.y;

            // Handle angle wrapping (find shortest rotation path)
            let angleDiff = targetAngle - currentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            // Apply smoothing (lerp factor of 0.1 = smooth, 1.0 = instant)
            const smoothFactor = 0.15;
            this.mesh.rotation.y = currentAngle + angleDiff * smoothFactor;

            // Update filteredFacing to match the smoothed visual rotation
            // This ensures raycasts match what the AI visually appears to be looking at
            this.filteredFacing.set(
                Math.sin(this.mesh.rotation.y),
                0,
                Math.cos(this.mesh.rotation.y)
            ).normalize();
        }

        // Update vision cone color based on state
        if (this.visionCone) {
            if (this.currentState === this.states.CHASE) {
                this.visionCone.material.color.setHex(0xff0000); // Red when chasing
                this.visionCone.material.opacity = 0.25;
            } else if (this.canSeePlayer) {
                this.visionCone.material.color.setHex(0xffaa00); // Orange when can see
                this.visionCone.material.opacity = 0.2;
            } else {
                this.visionCone.material.color.setHex(0x00ff00); // Green when patrolling
                this.visionCone.material.opacity = 0.1;
            }

            // If sight params changed, rebuild the cone geometry so cone angle matches sightAngle
            const sightRange = this.detection?.sightRange || 10;
            const sightAngle = this.detection?.sightAngle || Math.PI * 0.35;
            if (!this._visionParamsCache || this._visionParamsCache.range !== sightRange || this._visionParamsCache.angle !== sightAngle) {
                // Rebuild cone geometry
                const wedgeShape = new THREE.Shape();
                wedgeShape.moveTo(0, 0);
                const segments = 32;
                const halfAngle = sightAngle * 0.5;
                for (let i = 0; i <= segments; i++) {
                    const angle = -halfAngle + (i / segments) * sightAngle;
                    const x = Math.sin(angle) * sightRange;
                    const y = Math.cos(angle) * sightRange;
                    wedgeShape.lineTo(x, y);
                }
                wedgeShape.lineTo(0, 0);
                const newGeom = new THREE.ShapeGeometry(wedgeShape);
                try { this.visionCone.geometry.dispose && this.visionCone.geometry.dispose(); } catch (e) {}
                this.visionCone.geometry = newGeom;
                this._visionParamsCache = { range: sightRange, angle: sightAngle };
            }
            // Ensure cone sits slightly above ground to avoid z-fighting
            this.visionCone.position.y = 0.15;
        }

        // Update eye colors and glow based on state
        if (!this.eyeMaterials || this.eyes.length === 0) return; // Eyes not yet initialized

        let eyeMaterial;
        let glowIntensity = 0;
        let glowColor = 0xFF0000;

        switch (this.currentState) {
            case this.states.CHASE:
                eyeMaterial = this.eyeMaterials.chase;
                glowIntensity = 5.0; // Bright glow when chasing
                glowColor = 0xFF2200; // Bright red-orange
                break;
            case this.states.ALERT:
                // Pulsing eyes during alert to warn the player!
                eyeMaterial = this.eyeMaterials.chase; // Bright red eyes
                const pulseSpeed = 8.0; // Fast pulse
                const pulse = Math.sin(this.timers.alert * pulseSpeed) * 0.5 + 0.5; // 0 to 1
                glowIntensity = 2.0 + pulse * 6.0; // Pulse between 2 and 8
                glowColor = 0xFF0000; // Bright red
                break;
            case this.states.INVESTIGATE:
            case this.states.SEARCH:
                eyeMaterial = this.eyeMaterials.alert;
                glowIntensity = 2.0; // Medium glow when alert
                glowColor = 0xAA0000; // Dark red
                break;
            default:
                eyeMaterial = this.eyeMaterials.idle;
                glowIntensity = 0.5; // Dim glow when idle
                glowColor = 0x330000; // Very dark red
        }

        this.eyes.forEach(eye => {
            if (eye.material !== eyeMaterial) {
                eye.material = eyeMaterial;
            }
        });

        // Update eye glow light intensity and color
        if (this.eyeGlow) {
            this.eyeGlow.intensity = glowIntensity;
            this.eyeGlow.color.setHex(glowColor);
        }
    }

    updateAudio(delta) {
        // Handle wailing sound based on AI state
        if (this.audio.wailingSound && this.audio.wailingSound.buffer) {
            const shouldWail = this.currentState === this.states.PATROL || 
                               this.currentState === this.states.SEARCH ||
                               this.currentState === this.states.RETURN;
            
            if (shouldWail && !this.audio.isWailingPlaying) {
                this.audio.wailingSound.play();
                this.audio.isWailingPlaying = true;
            } else if (!shouldWail && this.audio.isWailingPlaying) {
                this.audio.wailingSound.stop();
                this.audio.isWailingPlaying = false;
            }
        }
        
        // Handle tension/chase music
        if (this.audio.tensionSound && this.audio.tensionSound.buffer) {
            const shouldPlayTension = this.currentState === this.states.CHASE;
            
            if (shouldPlayTension && !this.audio.isTensionPlaying) {
                this.audio.tensionSound.play();
                this.audio.isTensionPlaying = true;
            } else if (!shouldPlayTension && this.audio.isTensionPlaying) {
                this.audio.tensionSound.stop();
                this.audio.isTensionPlaying = false;
            }
        }
        
        // Heavy footstep audio based on movement and state
        const isMoving = this.velocity.lengthSq() > 0.1 && !this.attackData.isAttacking && this.audio.footstepLoaded && !this.footstepsPausedForZoom;
        let footstepInterval = 2.0; // Default interval (patrol)
        let playbackRate = 1.0; // Default rate
        if (this.currentState === this.states.CHASE) {
            footstepInterval = 0.4; // Faster steps when chasing
            playbackRate = 1.0;
        } else if (this.currentState === this.states.ALERT) {
            footstepInterval = 0.0; // No footsteps during alert
        } else if (this.currentState === this.states.PATROL) {
            footstepInterval = 2.0;
            playbackRate = 1.0;
        } else if (this.currentState === this.states.INVESTIGATE || this.currentState === this.states.SEARCH) {
            footstepInterval = 2.0;
            playbackRate = 1.15;
        } else {
            footstepInterval = 2.0;
            playbackRate = 1.0;
        }

        if (isMoving && footstepInterval > 0) {
            this.audio.lastFootstep += delta;
            if (this.audio.lastFootstep > footstepInterval) {
                if (this.audio.footstepSound && this.audio.footstepSound.buffer) {
                    this.audio.footstepSound.setPlaybackRate(playbackRate);
                    this.audio.footstepSound.stop(); // Stop if still playing
                    this.audio.footstepSound.play();
                }
                this.audio.lastFootstep = 0;
            }
        } else if (!isMoving) {
            this.audio.lastFootstep = 0;
        }
        // If zoom effect is active, pause any currently playing footstep
        if (this.footstepsPausedForZoom && this.audio.footstepSound && this.audio.footstepSound.isPlaying) {
            this.audio.footstepSound.pause && this.audio.footstepSound.pause();
        }
    }

    getPosition() {
        return this.position.clone();
    }

    destroy() {
        // Stop and clean up audio
        if (this.audio.wailingSound) {
            if (this.audio.isWailingPlaying) {
                this.audio.wailingSound.stop();
            }
            this.mesh.remove(this.audio.wailingSound);
        }
        
        // Stop tension sound
        if (this.audio.tensionSound) {
            if (this.audio.isTensionPlaying) {
                this.audio.tensionSound.stop();
            }
        }
        
        this.scene.remove(this.mesh);
        // Physics cleanup would go here
    }
}