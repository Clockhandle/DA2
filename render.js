import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

//TODO: Ammo physic engine
//      Cut Meshes to look more natural.

// =================================================================
// == 3D SCENE SETUP (Scene, Camera, Renderer, Light)
// =================================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080);

const camera = new THREE.PerspectiveCamera(
  75, // Fov
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);
camera.position.set(0, 3, 0); // Moved from bottom

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.zIndex = "0";
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.25;
controls.enableZoom = true;

// =================================================================
// == GLOBAL STATE & HELPER VARIABLES
// =================================================================

// --- Mesh Management ---
let currentMesh = null;
let originalMesh = null;
let cutMesh = null;
const loader = new PLYLoader();

// --- Physics ---
let physicsWorld = null;
let rigidBodies = [];
let ammoReady = false;
const tempAmmoTransform = new Ammo.btTransform();
const tempThreeMatrix = new THREE.Matrix4();

// --- Animation ---
let flying = false;
let flyingDirections = [];
let flyingSpeed = 5.0; // Adjust for faster/slower movement
const explosionCenter = new THREE.Vector3(0, 0, 0); // You can adjust this

// (Debug sphere for explosion center)
const sphereGeometry = new THREE.SphereGeometry(5, 32, 32);
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const explosionSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
explosionSphere.position.copy(explosionCenter);
scene.add(explosionSphere);


// =================================================================
// == PHYSICS INITIALIZATION
// =================================================================

function initPhysics() {
    if (typeof Ammo === 'undefined') {
        console.log("Waiting for Ammo.js to load...");
        setTimeout(initPhysics, 100); // Check again in 100ms
        return;
    }

    console.log("Ammo.js loaded, initializing physics world.");
    const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
    const broadphase = new Ammo.btDbvtBroadphase();
    const solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
    physicsWorld.setGravity(new Ammo.btVector3(0, -9.8, 0));
    ammoReady = true;
}

initPhysics();

// =================================================================
// == PHYSICS HELPER FUNCTION
// =================================================================

// Helper to add physics body (FIXED VERSION 3.0)
// This version calculates the geometry's center to counteract
// Ammo.js's automatic center-of-mass shift.
function addPhysicsBody(mesh, mass) {
    // Force the mesh to update its world matrix
    mesh.updateWorldMatrix(true, false);
    const worldMatrix = mesh.matrixWorld;
    
    // Decompose the world matrix
    const transform = new Ammo.btTransform();
    const tempQuat = new THREE.Quaternion();
    const tempPos = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    worldMatrix.decompose(tempPos, tempQuat, tempScale);
    
    // Create the collision shape
    const shape = new Ammo.btConvexHullShape();
    const geometry = mesh.geometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertices = positionAttribute.array;

    // Add vertices
    for (let i = 0; i < positionAttribute.count; i++) {
        shape.addPoint(new Ammo.btVector3(
            vertices[i * 3], 
            vertices[i * 3 + 1], 
            vertices[i * 3 + 2]
        ), true);
    }

    // --- *** THE DEFINITIVE FIX *** ---
    // Scale the PHYSICS HULL down by 1% to create a tiny, invisible
    // gap between pieces. This guarantees no initial overlap/explosion.
    // The VISUAL mesh (tempScale) remains full size.
    const physicsScale = 0.99; // 99% of the original size
    shape.setLocalScaling(new Ammo.btVector3(
        tempScale.x * physicsScale, 
        tempScale.y * physicsScale, 
        tempScale.z * physicsScale
    ));
    // --- *** END FIX *** ---
    
    // Set margin to zero (still good practice)
    shape.setMargin(0);

    transform.setOrigin(new Ammo.btVector3(tempPos.x, tempPos.y, tempPos.z));
    transform.setRotation(new Ammo.btQuaternion(tempQuat.x, tempQuat.y, tempQuat.z, tempQuat.w));
    
    const motionState = new Ammo.btDefaultMotionState(transform);

    const localInertia = new Ammo.btVector3(0, 0, 0);
    if (mass > 0) shape.calculateLocalInertia(mass, localInertia);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
    const body = new Ammo.btRigidBody(rbInfo);

    body.setMotionState(motionState); 

    if (mass > 0) {
        // Start dynamic bodies in a "sleeping" state
        // 5 = ISLAND_SLEEPING
        body.setActivationState(5);
    }

    physicsWorld.addRigidBody(body);
    mesh.userData.physicsBody = body;
    if (mass > 0) rigidBodies.push(mesh);
}


// =================================================================
// == MESH LOADING
// =================================================================

// --- Load the initial cube ---
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

        // Add static physics body when Ammo is ready
        const checkAmmo = setInterval(() => {
            if (ammoReady) {
                addPhysicsBody(mesh, 0); // mass = 0 for static
                clearInterval(checkAmmo);
            }
        }, 50);
    },
    (progress) => {
        console.log("Loading progress:", (progress.loaded / progress.total) * 100 + "%");
    },
    (error) => {
        console.error("Error loading PLY: ", error);
    }
);

// --- Load the cut-up tetrahedra model (called by button) ---
function loadCutModel() {
    const cutLoader = new PLYLoader();

    cutLoader.load(
        "models/ply/cube_test/Cube_tetrahedra.ply",
        (geometry) => {
            geometry.computeVertexNormals();

            // Load the .tet file for tetrahedron indices
            fetch("models/ply/cube_test/Cube_tetrahedra.tet")
                .then(response => response.text())
                .then(text => {
                    
                    // --- Cleanup previous model ---
                    if (cutMesh) {
                        // Loop through all old tetrahedra and remove their physics bodies
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
                            originalMesh.userData.physicsBody = null; // Clear the reference
                        }
                        scene.remove(originalMesh);
                    }
                    // --- End Cleanup ---


                    // --- Create new model ---
                    const positions = geometry.attributes.position.array;
                    const tetraGroup = new THREE.Group();

                    const lines = text.trim().split('\n');
                    const numTetrahedra = parseInt(lines[0]);
                    for (let i = 1; i <= numTetrahedra; i++) {
                        const [v1, v2, v3, v4] = lines[i].split(' ').map(Number);

                        const verts = [
                            positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2],
                            positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2],
                            positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2],
                            positions[v4 * 3], positions[v4 * 3 + 1], positions[v4 * 3 + 2],
                        ];

                        const indices = [ 0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3 ];

                        const tetraGeometry = new THREE.BufferGeometry();
                        tetraGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                        tetraGeometry.setIndex(indices);
                        tetraGeometry.computeVertexNormals();

                        const tetraMesh = new THREE.Mesh(
                            tetraGeometry,
                            new THREE.MeshStandardMaterial({ color: 0xff4444, wireframe: true, side: THREE.DoubleSide })
                        );
                        tetraGroup.add(tetraMesh);
                    }

                    tetraGroup.scale.set(2, 2, 2);
                    tetraGroup.rotateX(-Math.PI / 2); // <--- Transformation is applied here

                    cutMesh = tetraGroup;
                    scene.add(cutMesh);
                    currentMesh = cutMesh;

                    // --- Add physics bodies for each new piece ---
                    if (ammoReady) {
                        cutMesh.children.forEach(tetraMesh => {
                            tetraMesh.updateWorldMatrix(true, false); 
                            addPhysicsBody(tetraMesh, 0); // <-- Set back to 1 for dynamic
                        });
                    }

                    console.log("Tetrahedra model loaded in original positions!");
                });
        },
        (progress) => {
            console.log("Loading tetrahedra model:", (progress.loaded / progress.total) * 100 + "%");
        },
        (error) => {
            console.error("Error loading tetrahedra PLY:", error);
            alert("Failed to load tetrahedra model: " + error.message);
        }
    );
}


// =================================================================
// == UI BUTTON EVENT LISTENERS
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
            console.log("Tetgen success");
            console.log("Output: ", result.output);
            
            // Load the generated cut model
            loadCutModel();
            
        } else {
            console.error("Tetgen failed: ", result.error);
            alert(`Tetgen failed: "${result.error}"`);
        }
    } catch (error) {
        console.log("Server communication error: ", error);
        alert(`Server error: ${error.message}`);
    }
});

document.getElementById("resetModelBtn").addEventListener("click", () => {
    // NOTE: This will require a page reload to reset the physics,
    // or a much more complex reset function.
    
    // Stop flying animation and clear directions
    flying = false;
    flyingDirections = [];

    // Remove cut mesh if present
    if (cutMesh) {
        // Proper cleanup
        cutMesh.children.forEach(tetraMesh => {
            if (tetraMesh.userData.physicsBody) {
                physicsWorld.removeRigidBody(tetraMesh.userData.physicsBody);
                tetraMesh.userData.physicsBody = null;
            }
        });
        scene.remove(cutMesh);
        cutMesh = null;
        rigidBodies = [];
    }

    // Show the original mesh (if it hasn't been added back)
    if (originalMesh && !scene.children.includes(originalMesh)) {
        scene.add(originalMesh);
        // Add its physics body back
        if (ammoReady) {
             addPhysicsBody(originalMesh, 0);
        }
    }
    currentMesh = originalMesh;

    console.log("Reset to original model");
    // A simple page reload might be easier
    // window.location.reload(); 
});

document.getElementById("scrambleModelBtn").addEventListener("click", () => {
    if (cutMesh) {
        scrambleAllTetrahedraPositions();
    } else {
        scrambleModelPosition(currentMesh || originalMesh);
    }
});

document.getElementById("randomizeFlyingBtn").addEventListener("click", () => {
    if (!cutMesh) return;
    flying = true;
    flyingDirections = [];
    cutMesh.children.forEach((tetra) => {
        // Calculate the center of the tetrahedron geometry
        const body = tetra.userData.physicsBody;
        if (body) {
            body.activate(); // This "wakes up" the body
        }
        const posAttr = tetra.geometry.getAttribute('position');
        let center = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < posAttr.count; i++) {
            center.add(new THREE.Vector3(
                posAttr.getX(i),
                posAttr.getY(i),
                posAttr.getZ(i)
            ));
        }
        center.multiplyScalar(1 / posAttr.count);

        // Direction from explosion center to tetrahedron center
        const dir = center.clone().sub(explosionCenter).normalize();
        flyingDirections.push(dir);
    });
});

document.getElementById("addMassBtn").addEventListener("click", () => {
    if (!cutMesh) {
        console.log("No cut model to add mass to.");
        return;
    }
    
    console.log("Adding mass and activating physics...");

    const newMass = 1.0;
    const localInertia = new Ammo.btVector3(0, 0, 0);

    cutMesh.children.forEach(tetraMesh => {
        const body = tetraMesh.userData.physicsBody;
        if (body) {
            
            // 1. Get the shape and calculate inertia
            const shape = body.getCollisionShape();
            shape.calculateLocalInertia(newMass, localInertia);
            
            // 2. Set the mass. Ammo.js will now calculate
            //    the CoM and apply its internal shift.
            body.setMassProps(newMass, localInertia);
            
            // 3. Update and wake up
            body.updateInertiaTensor();
            body.activate();

            // 4. Add to update list
            if (!rigidBodies.includes(tetraMesh)) {
                rigidBodies.push(tetraMesh);
            }
        }
    });

    console.log("All tetrahedra are now dynamic.");
});

// =================================================================
// == UI HELPER FUNCTIONS
// =================================================================

function scrambleModelPosition(mesh) {
    if (!mesh) return;
    // Note: This won't work on a static physics body
    mesh.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
}

function scrambleAllTetrahedraPositions() {
    if (!cutMesh) return;
    // This will fight with the physics simulation.
    // A better way would be to apply a physics impulse.
    const count = cutMesh.children.length;
    const radius = 150; // Increased radius for more separation
    cutMesh.children.forEach((tetra, i) => {
        const angle = (i / count) * Math.PI * 2;
        tetra.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0
        );
    });
}


// =================================================================
// == MAIN ANIMATION LOOP
// =================================================================

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = 1 / 60; // Assuming 60 FPS

    // --- Physics Update ---
    if (physicsWorld && ammoReady) {
        physicsWorld.stepSimulation(deltaTime, 10);

        // Update visual positions of dynamic bodies
        rigidBodies.forEach(mesh => {
            const body = mesh.userData.physicsBody;
            const ms = body.getMotionState();
            
            if (ms) {
                ms.getWorldTransform(tempAmmoTransform); // Get world transform from physics
                
                const p = tempAmmoTransform.getOrigin();
                const q = tempAmmoTransform.getRotation();

                // Get the parent's inverse world matrix
                mesh.parent.updateWorldMatrix(true, false);
                const parentInverse = mesh.parent.matrixWorld.clone().invert();

                // Create a THREE.Matrix4 from the physics (world) transform
                tempThreeMatrix.compose(
                    new THREE.Vector3(p.x(), p.y(), p.z()),
                    new THREE.Quaternion(q.x(), q.y(), q.z(), q.w()),
                    mesh.scale // Preserve the mesh's local scale
                );
                
                // Convert the world transform to a local transform
                tempThreeMatrix.premultiply(parentInverse);
                
                // Decompose the local matrix into the mesh's properties
                tempThreeMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
            }
        });
    }

    // --- Animation Update ---
    if (flying && cutMesh && flyingDirections.length === cutMesh.children.length) {
        // This will fight with physics. Should disable physics for flying.
        cutMesh.children.forEach((tetra, i) => {
            tetra.position.add(flyingDirections[i].clone().multiplyScalar(flyingSpeed * deltaTime));
        });
    }

    // --- Render ---
    controls.update();
    renderer.render(scene, camera);
}

animate();