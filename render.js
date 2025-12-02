import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// =================================================================
// SCENE SETUP
// =================================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080);

const camera = new THREE.PerspectiveCamera(
  75, // Fov
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

camera.position.set(-374, 794, 302); // Rounded from your logged position
camera.rotation.set(-0.31, 0.01, 0.00); // Rounded from your logged rotation


const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.zIndex = "0";
document.body.appendChild(renderer.domElement);

// =================================================================
// GPU CHECK
// =================================================================
const gl = renderer.getContext();
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
if (debugInfo) {
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const rendererName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    console.log("GPU Vendor:", vendor);
    console.log("GPU Renderer:", rendererName);
} else {
    console.log("WebGL Active, but debug info unavailable.");
}
// -----------------

const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambientLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.25;
controls.enableZoom = true;

// =================================================================
// GLOBAL VARIABLES
// =================================================================

let currentMesh = null;
let originalMesh = null;
let cutMesh = null;
const loader = new PLYLoader();

let physicsWorld = null;
let rigidBodies = [];
let ammoReady = false;
const tempAmmoTransform = new Ammo.btTransform();
const tempThreeMatrix = new THREE.Matrix4();

let explosionCenter = new THREE.Vector3(0, 0, 0); // Center point of explosion
let explosionForce = 750; // Force magnitude
let explosionRadius = 200; // Max distance for force effect
let explosionIndicator = null; // Visual marker for bomb position

// =================================================================
// PHYSICS INITIALIZATION
// =================================================================

function initPhysics() {
    if (typeof Ammo === 'undefined') {
        setTimeout(initPhysics, 100);
        return;
    }

    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -50, 0));
    ammoReady = true;
}

initPhysics();

// =================================================================
// PHYSICS HELPERS
// =================================================================

function addPhysicsBody(mesh, mass) {
    mesh.updateWorldMatrix(true, false);
    const worldMatrix = mesh.matrixWorld;
    
    const transform = new Ammo.btTransform();
    const tempQuat = new THREE.Quaternion();
    const tempPos = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    worldMatrix.decompose(tempPos, tempQuat, tempScale);
    
    const shape = new Ammo.btConvexHullShape();
    const geometry = mesh.geometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertices = positionAttribute.array;

    for (let i = 0; i < positionAttribute.count; i++) {
        shape.addPoint(new Ammo.btVector3(
            vertices[i * 3], 
            vertices[i * 3 + 1], 
            vertices[i * 3 + 2]
        ), true);
    }

    const physicsScale = 0.99;
    shape.setLocalScaling(new Ammo.btVector3(
        tempScale.x * physicsScale, 
        tempScale.y * physicsScale, 
        tempScale.z * physicsScale
    ));
    
    shape.setMargin(0.01); // Small margin helps pointy collisions

    transform.setOrigin(new Ammo.btVector3(tempPos.x, tempPos.y, tempPos.z));
    transform.setRotation(new Ammo.btQuaternion(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w));
    
    const motionState = new Ammo.btDefaultMotionState(transform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    if (mass > 0) shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);

    if (mass > 0) {
        body.setActivationState(1); // 1 = ACTIVE_TAG (Wake up immediately)
        // Enable Continuous Collision Detection (CCD) for fast/pointy objects
        body.setCcdMotionThreshold(1e-7);
        body.setCcdSweptSphereRadius(0.2);
    }

    physicsWorld.addRigidBody(body);
    mesh.userData.physicsBody = body;
    if (mass > 0) rigidBodies.push(mesh);
}

// =================================================================
// MESH LOADING
// =================================================================

loader.load(
    "models/ply/cube_test/Cube.ply",
    (geometry) => {
        geometry.computeVertexNormals();
        
        let material;
        if (geometry.attributes.color) {
            material = new THREE.MeshStandardMaterial({
                vertexColors: true,
                side: THREE.DoubleSide
            });
        } 
		else {
            material = new THREE.MeshStandardMaterial({
                color: 0xcc7a00, // Orange-brown
				wireframe: true,
                side: THREE.DoubleSide
            });
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, 0);
        mesh.scale.set(2, 2, 2);

		originalMesh = mesh;
		currentMesh = mesh;

        scene.add(mesh);

        const checkAmmo = setInterval(() => {
            if (ammoReady) {
                addPhysicsBody(mesh, 0);
                clearInterval(checkAmmo);
            }
        }, 50);
    }
);

// =================================================================
// ENVIRONMENT SETUP
// =================================================================

function createGroundPlane() {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x404040, 
        side: THREE.DoubleSide 
    });
    
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -200;
    
    scene.add(groundMesh);
    
    const checkAmmo = setInterval(() => {
        if (ammoReady) {
            const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(500, 1.0, 500));
            const transform = new Ammo.btTransform();
            transform.setIdentity();
            transform.setOrigin(new Ammo.btVector3(0, -201, 0));
            const motionState = new Ammo.btDefaultMotionState(transform);
            const rbInfo = new Ammo.btRigidBodyConstructionInfo(0, motionState, groundShape, new Ammo.btVector3(0, 0, 0));
            const body = new Ammo.btRigidBody(rbInfo);
            body.setRestitution(0.5);
            body.setFriction(0.8);
            physicsWorld.addRigidBody(body);
            groundMesh.userData.physicsBody = body;
            clearInterval(checkAmmo);
        }
    }, 50);
}

setTimeout(() => {
    if (ammoReady) {
        createGroundPlane();
    } else {
        const waitForAmmo = setInterval(() => {
            if (ammoReady) {
                createGroundPlane();
                clearInterval(waitForAmmo);
            }
        }, 100);
    }
}, 500);

// =================================================================
// TETGEN MODEL LOADING
// =================================================================

function loadCutModel() {
    const cutLoader = new PLYLoader();

    if (cutMesh) {
        cutMesh.children.forEach(tetraMesh => {
            if (tetraMesh.userData.physicsBody) {
                physicsWorld.removeRigidBody(tetraMesh.userData.physicsBody);
                tetraMesh.userData.physicsBody = null;
            }
        });
        scene.remove(cutMesh);
    }
    if (originalMesh) {
        if (originalMesh.userData.physicsBody) {
            physicsWorld.removeRigidBody(originalMesh.userData.physicsBody);
            originalMesh.userData.physicsBody = null;
        }
        scene.remove(originalMesh);
    }

    fetch("models/ply/cube_test/Cube_tetrahedra.tet")
        .then(response => response.text())
        .then(text => {
            const lines = text.trim().split('\n');
            const numTetrahedra = parseInt(lines[0]);
            
            const tetraGroup = new THREE.Group();
            let loadedCount = 0;
            const totalPieces = numTetrahedra * 5; // 5 pieces per tetrahedron

            for (let i = 0; i < numTetrahedra; i++) {
                const paddedIndex = String(i).padStart(4, '0');
                
                // Load 4 corner pieces + 1 center piece
                const pieceNames = ['corner0', 'corner1', 'corner2', 'corner3', 'center'];
                
                pieceNames.forEach(pieceName => {
                    const filename = `models/ply/cube_test/tetra_${paddedIndex}_${pieceName}.ply`;
                    
                    cutLoader.load(
                        filename,
                        (geometry) => {
                            geometry.computeVertexNormals();
                            
                            const material = new THREE.MeshStandardMaterial({ 
                                color: 0xff4444, 
                                wireframe: true, 
                                side: THREE.DoubleSide 
                            });
                            
                            const mesh = new THREE.Mesh(geometry, material);
                            tetraGroup.add(mesh);
                            
                            loadedCount++;
                            
                            if (loadedCount === totalPieces) {
                                tetraGroup.scale.set(2, 2, 2);
                                tetraGroup.rotateX(-Math.PI / 2);

                                cutMesh = tetraGroup;
                                scene.add(cutMesh);
                                currentMesh = cutMesh;

                                if (ammoReady) {
                                    tetraGroup.children.forEach(mesh => {
                                        mesh.updateWorldMatrix(true, false);
                                        addPhysicsBody(mesh, 0.0);
                                    });
                                }
                                
                                console.log(`Loaded ${totalPieces} pieces (${numTetrahedra} tetrahedra × 5 pieces each)`);
                            }
                        }
                    );
                });
            }
        });
}

// =================================================================
// UI EVENT HANDLERS
// =================================================================

document.getElementById("cutModelBtn").addEventListener("click", async () => {
    if(!originalMesh) return;

    try {
        const response = await fetch("http://localhost:3000/api/run-tetgen", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();

        if(result.success) {
            loadCutModel();
        } else {
            alert(`Tetgen failed: "${result.error}"`);
        }
    } catch (error) {
        alert(`Server error: ${error.message}`);
    }
});

document.getElementById("resetModelBtn").addEventListener("click", async () => {

    removeExplosionIndicator();
    // Remove cut mesh if present
    if (cutMesh) {
        cutMesh.children.forEach(tetraMesh => {
            if (tetraMesh.userData.physicsBody) {
                physicsWorld.removeRigidBody(tetraMesh.userData.physicsBody);
                tetraMesh.userData.physicsBody = null;
            }
        });
        scene.remove(cutMesh);
        cutMesh = null;
        rigidBodies = [];
        
        // Call the cleanup endpoint to delete generated files
        try {
            const response = await fetch("http://localhost:3000/api/cleanup-tetgen", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            
            const result = await response.json();
            if (result.success) {
                console.log(`Cleaned up ${result.deletedCount} tetgen files`);
            } else {
                console.error("Cleanup failed:", result.error);
            }
        } catch (error) {
            console.error("Failed to cleanup tetgen files:", error);
        }
    }

    if (originalMesh && !scene.children.includes(originalMesh)) {
        scene.add(originalMesh);
        if (ammoReady) {
             addPhysicsBody(originalMesh, 0);
        }
    }
    currentMesh = originalMesh;
});

document.getElementById("scrambleModelBtn").addEventListener("click", () => {
    if (cutMesh) {
        scrambleAllTetrahedraPositions();
    } else {
        scrambleModelPosition(currentMesh || originalMesh);
    }
});

document.getElementById("activateExplosionBtn").addEventListener("click", () => {
    if (!cutMesh) {
        console.log("Cut the model first!");
        return;
    }
    
    explosionCenter.set(0, 0, 0);
    
    createExplosionIndicator();
    
    // Apply explosion after a short delay (simulating fuse/detonation)
    setTimeout(() => {
        applyExplosionForce();
    }, 500); // 0.5 second delay to see the indicator
});

document.addEventListener("keydown", (event) => {
    if (event.key === "p" || event.key === "P") {
        console.log("Camera Position:", camera.position);
        console.log(`x: ${camera.position.x}, y: ${camera.position.y}, z: ${camera.position.z}`);
        console.log("Camera Rotation:", camera.rotation);
        console.log("Camera Target (controls):", controls.target);
    }
});

// =================================================================
// HELPER FUNCTIONS
// =================================================================

function scrambleModelPosition(mesh) {
    if (!mesh) return;
    mesh.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
}

function scrambleAllTetrahedraPositions() {
    if (!cutMesh) return;
    const count = cutMesh.children.length;
    const radius = 150;
    cutMesh.children.forEach((tetra, i) => {
        const angle = (i / count) * Math.PI * 2;
        tetra.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0
        );
    });
}

function createExplosionIndicator() {
    // Remove old indicator if exists
    if (explosionIndicator) {
        scene.remove(explosionIndicator);
    }
    
    // Create a red sphere to show bomb location
    const geometry = new THREE.SphereGeometry(5, 16, 16);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        transparent: true,
        opacity: 0.7,
        wireframe: true
    });
    
    explosionIndicator = new THREE.Mesh(geometry, material);
    explosionIndicator.position.copy(explosionCenter);
    scene.add(explosionIndicator);
    
    console.log(`Explosion center set at: (${explosionCenter.x}, ${explosionCenter.y}, ${explosionCenter.z})`);
}

function removeExplosionIndicator() {
    if (explosionIndicator) {
        scene.remove(explosionIndicator);
        explosionIndicator = null;
    }
}

function applyExplosionForce() {
    if (!cutMesh || !ammoReady) {
        console.log("No cut mesh or physics not ready");
        return;
    }
    
    console.log("Starting explosion sequence...");
    
    // First, make all pieces dynamic (activate gravity)
    cutMesh.children.forEach(mesh => {
        const existingBody = mesh.userData.physicsBody;
        
        if (existingBody) {
            // Remove the old static body
            physicsWorld.removeRigidBody(existingBody);
            
            // Remove from rigidBodies array if present
            const index = rigidBodies.indexOf(mesh);
            if (index > -1) {
                rigidBodies.splice(index, 1);
            }
            
            // Clear the reference
            mesh.userData.physicsBody = null;
        }
        
        // Create new dynamic body with mass = 1.0
        mesh.updateWorldMatrix(true, false);
        addPhysicsBody(mesh, 1.0);
    });
    
    console.log(`Converted ${cutMesh.children.length} pieces to dynamic bodies`);
    
    setTimeout(() => {
        cutMesh.children.forEach(mesh => {
            const body = mesh.userData.physicsBody;
            if (!body) {
                console.warn("Mesh missing physics body!");
                return;
            }
            
            mesh.updateWorldMatrix(true, false);
            const meshPos = new THREE.Vector3();
            meshPos.setFromMatrixPosition(mesh.matrixWorld);
            
            const direction = new THREE.Vector3().subVectors(meshPos, explosionCenter);
            const distance = direction.length();
            
            // Skip if too far away
            if (distance > explosionRadius) {
                console.log(`Piece too far: ${distance} > ${explosionRadius}`);
                return;
            }
            
            // Avoid division by zero if piece is exactly at center
            if (distance < 0.1) {
                direction.set(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                );
            }
            
            // Normalize direction
            direction.normalize();
            
            // Calculate force based on distance (closer = stronger)
            const forceMagnitude = explosionForce * (1 - distance / explosionRadius);
            
            console.log(`Applying force: ${forceMagnitude} at distance: ${distance}`);
            
            // Apply impulse to the rigid body
            const impulse = new Ammo.btVector3(
                direction.x * forceMagnitude,
                direction.y * forceMagnitude - 300,
                direction.z * forceMagnitude
            );
            
            body.activate(); // Wake up the body
            body.applyCentralImpulse(impulse);
            
            // Also add some random spin for more realistic explosion
            const torque = new Ammo.btVector3(
                (Math.random() - 0.5) * forceMagnitude * 0.5,
                (Math.random() - 0.5) * forceMagnitude * 0.5,
                (Math.random() - 0.5) * forceMagnitude * 0.5
            );
            body.applyTorqueImpulse(torque);
            
            Ammo.destroy(impulse);
            Ammo.destroy(torque);
        });
        
        console.log(`Explosion applied! Force: ${explosionForce}, Radius: ${explosionRadius}`);
    }, 50); // Small delay to ensure physics bodies are ready
    
    // Remove the indicator after explosion
    setTimeout(removeExplosionIndicator, 200);
}


// =================================================================
// ANIMATION LOOP
// =================================================================

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60;

    if (physicsWorld && ammoReady) {
        physicsWorld.stepSimulation(deltaTime, 10);

        rigidBodies.forEach(mesh => {
            const body = mesh.userData.physicsBody;
            const ms = body.getMotionState();
            
            if (ms) {
                ms.getWorldTransform(tempAmmoTransform);
                
                const p = tempAmmoTransform.getOrigin();
                const q = tempAmmoTransform.getRotation();

                mesh.parent.updateWorldMatrix(true, false);
                const parentInverse = mesh.parent.matrixWorld.clone().invert();

                tempThreeMatrix.compose(
                    new THREE.Vector3(p.x(), p.y(), p.z()),
                    new THREE.Quaternion(q.x(), q.y(), q.z(), q.w()),
                    mesh.scale
                );
                
                tempThreeMatrix.premultiply(parentInverse);
                
                const tempPos = new THREE.Vector3();
                const tempQuat = new THREE.Quaternion();
                const tempScale = new THREE.Vector3();
                tempThreeMatrix.decompose(tempPos, tempQuat, tempScale);
                
                mesh.position.copy(tempPos);
                mesh.quaternion.copy(tempQuat);
            }
        });
    }

    controls.update();
    renderer.render(scene, camera);
}

animate();