import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Minimal procedural maze - optimized for WebGPU performance
 * Uses single merged geometry + MeshBasicMaterial (no lighting cost)
 */
export function Maze(scene, world, RAPIER, options = {}) {
    const {
        gridSize = 8,        // Keep small! 8x8 = 64 cells max
        cellSize = 6,        // Size of each cell
        wallHeight = 8,      // Taller walls
        wallThickness = 0.5,
        offsetX = 30,        // Offset from player spawn
        offsetZ = 30
    } = options;

    console.log(`Generating ${gridSize}x${gridSize} maze...`);

    // --- MAZE GENERATION (Recursive Backtracker) ---
    const maze = [];
    for (let y = 0; y < gridSize; y++) {
        maze[y] = [];
        for (let x = 0; x < gridSize; x++) {
            maze[y][x] = { visited: false, walls: { north: true, south: true, east: true, west: true } };
        }
    }

    const stack = [];
    let current = { x: 0, y: 0 };
    maze[0][0].visited = true;
    stack.push(current);

    while (stack.length > 0) {
        const neighbors = [];
        const { x, y } = current;

        if (y > 0 && !maze[y - 1][x].visited) neighbors.push({ x, y: y - 1, dir: 'north' });
        if (y < gridSize - 1 && !maze[y + 1][x].visited) neighbors.push({ x, y: y + 1, dir: 'south' });
        if (x < gridSize - 1 && !maze[y][x + 1].visited) neighbors.push({ x: x + 1, y, dir: 'east' });
        if (x > 0 && !maze[y][x - 1].visited) neighbors.push({ x: x - 1, y, dir: 'west' });

        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            
            // Remove walls between current and next
            if (next.dir === 'north') { maze[y][x].walls.north = false; maze[next.y][next.x].walls.south = false; }
            if (next.dir === 'south') { maze[y][x].walls.south = false; maze[next.y][next.x].walls.north = false; }
            if (next.dir === 'east') { maze[y][x].walls.east = false; maze[next.y][next.x].walls.west = false; }
            if (next.dir === 'west') { maze[y][x].walls.west = false; maze[next.y][next.x].walls.east = false; }

            maze[next.y][next.x].visited = true;
            stack.push(current);
            current = next;
        } else {
            current = stack.pop();
        }
    }

    // --- ENTRANCE AND EXIT ---
    // Entrance: Remove west wall of top-left cell (0,0)
    maze[0][0].walls.west = false;
    
    // Exit: Remove east wall of bottom-right cell
    maze[gridSize - 1][gridSize - 1].walls.east = false;

    // --- BUILD GEOMETRY (Collect all wall boxes and doors) ---
    const geometries = [];
    const wallGeo = new THREE.BoxGeometry(cellSize, wallHeight, wallThickness);
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, cellSize);
    const doorGeo = new THREE.BoxGeometry(cellSize * 0.8, wallHeight, wallThickness); // Slightly narrower door

    // Collision data for Rapier
    const colliders = [];
    const doors = []; // Array to hold door objects

    let wallCount = 0;

    function createDoor(x, y, z, rotationY, geo, scene, world, RAPIER, doorsArray) {
        const doorMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x8B4513 })); // Brown color for doors
        doorMesh.position.set(x, y, z);
        doorMesh.rotation.y = rotationY;
        scene.add(doorMesh);

        const doorBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z));
        const doorCollider = RAPIER.ColliderDesc.cuboid(cellSize * 0.4, wallHeight / 2, wallThickness / 2).setTranslation(0, 0, 0);
        world.createCollider(doorCollider, doorBody);

        doorsArray.push({
            mesh: doorMesh,
            body: doorBody,
            open: false,
            originalPosition: { x, y, z },
            rotationY: rotationY
        });
    }

    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const cell = maze[y][x];
            const worldX = x * cellSize + offsetX;
            const worldZ = y * cellSize + offsetZ;

            // North wall
            if (cell.walls.north) {
                wallCount++;
                if (wallCount % 4 === 0) { // Every 4th wall is a door
                    createDoor(worldX, wallHeight / 2, worldZ - cellSize / 2, 0, doorGeo, scene, world, RAPIER, doors);
                } else {
                    const geo = wallGeo.clone();
                    geo.translate(worldX, wallHeight / 2, worldZ - cellSize / 2);
                    geometries.push(geo);
                    colliders.push({ x: worldX, y: wallHeight / 2, z: worldZ - cellSize / 2, hx: cellSize / 2, hy: wallHeight / 2, hz: wallThickness / 2 });
                }
            }

            // South wall (only for bottom row to avoid duplicates)
            if (y === gridSize - 1 && cell.walls.south) {
                wallCount++;
                if (wallCount % 4 === 0) {
                    createDoor(worldX, wallHeight / 2, worldZ + cellSize / 2, Math.PI, doorGeo, scene, world, RAPIER, doors);
                } else {
                    const geo = wallGeo.clone();
                    geo.translate(worldX, wallHeight / 2, worldZ + cellSize / 2);
                    geometries.push(geo);
                    colliders.push({ x: worldX, y: wallHeight / 2, z: worldZ + cellSize / 2, hx: cellSize / 2, hy: wallHeight / 2, hz: wallThickness / 2 });
                }
            }

            // West wall
            if (cell.walls.west) {
                wallCount++;
                if (wallCount % 4 === 0) {
                    createDoor(worldX - cellSize / 2, wallHeight / 2, worldZ, -Math.PI / 2, doorGeo, scene, world, RAPIER, doors);
                } else {
                    const geo = sideWallGeo.clone();
                    geo.translate(worldX - cellSize / 2, wallHeight / 2, worldZ);
                    geometries.push(geo);
                    colliders.push({ x: worldX - cellSize / 2, y: wallHeight / 2, z: worldZ, hx: wallThickness / 2, hy: wallHeight / 2, hz: cellSize / 2 });
                }
            }

            // East wall (only for right column to avoid duplicates)
            if (x === gridSize - 1 && cell.walls.east) {
                wallCount++;
                if (wallCount % 4 === 0) {
                    createDoor(worldX + cellSize / 2, wallHeight / 2, worldZ, Math.PI / 2, doorGeo, scene, world, RAPIER, doors);
                } else {
                    const geo = sideWallGeo.clone();
                    geo.translate(worldX + cellSize / 2, wallHeight / 2, worldZ);
                    geometries.push(geo);
                    colliders.push({ x: worldX + cellSize / 2, y: wallHeight / 2, z: worldZ, hx: wallThickness / 2, hy: wallHeight / 2, hz: cellSize / 2 });
                }
            }
        }
    }

    console.log(`Maze walls: ${geometries.length}`);

    // --- MERGE INTO SINGLE MESH ---
    if (geometries.length === 0) {
        console.warn('No maze walls generated');
        return null;
    }

    const mergedGeometry = mergeGeometries(geometries, false);
    
    // MeshLambertMaterial = Basic lighting (diffuse only) - supports flashlight
    const material = new THREE.MeshLambertMaterial({
        color: 0x333333,  // Medium gray for good lighting visibility
        side: THREE.FrontSide
    });

    const mazeMesh = new THREE.Mesh(mergedGeometry, material);
    mazeMesh.name = 'maze';
    // No shadows for performance - just basic lighting from flashlight
    scene.add(mazeMesh);

    // --- PHYSICS COLLIDERS (One compound body) ---
    const mazeBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const mazeBody = world.createRigidBody(mazeBodyDesc);

    for (const c of colliders) {
        const colliderDesc = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz)
            .setTranslation(c.x, c.y, c.z);
        world.createCollider(colliderDesc, mazeBody);
    }

    // Log entrance and exit positions
    const entranceX = offsetX - cellSize / 2;
    const entranceZ = offsetZ;
    const exitX = offsetX + (gridSize - 1) * cellSize + cellSize / 2;
    const exitZ = offsetZ + (gridSize - 1) * cellSize;
    
    console.log(`Maze created: 1 mesh, ${colliders.length} colliders`);
    console.log(`Entrance at: (${entranceX}, 0, ${entranceZ})`);
    console.log(`Exit at: (${exitX}, 0, ${exitZ})`);

    // Cleanup individual geometries
    for (const geo of geometries) {
        geo.dispose();
    }

    return {
        mesh: mazeMesh,
        entrance: { x: entranceX, z: entranceZ },
        exit: { x: exitX, z: exitZ },
        doors: doors
    };
}
