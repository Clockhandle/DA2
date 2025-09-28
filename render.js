import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
// Create a camera
const camera = new THREE.PerspectiveCamera(
  75, // Field of view
  window.innerWidth / window.innerHeight, // Aspect ratio
  0.1, // Near clipping plane
  1000 // Far clipping plane
);

// Create a WebGL renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add lighting to see your model properly
const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;

// Add shadow configuration
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;

scene.add(directionalLight);

// // Add a second light for fill lighting
// const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.3); // Soft blue light
// fillLight.position.set(-5, 5, -5);
// scene.add(fillLight);

// Add a warm point light for atmosphere
// const pointLight = new THREE.PointLight(0xffaa00, 1, 1000);
// pointLight.position.set(0, 3, 0);
// scene.add(pointLight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const loader = new GLTFLoader();
let loadedModel;

loader.load(
    'models/gltf/monke_test/Monke.glb',
    (gltf) => {
        loadedModel = gltf.scene;
        scene.add(loadedModel);

        loadedModel.position.set(0, 0, 0);
        loadedModel.scale.set(2, 2, 2);

        let allVertices = [];

        loadedModel.traverse((child) => {
            if (child.isMesh && child.geometry) {
              const vertices = child.geometry.attributes.position.array;

              for(let i = 0; i < vertices.length; i += 3) {
                allVertices.push(new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]));
              }
            }
        });

        console.log(`Total vertices extracted: ${allVertices.length}`);
        const jsonVertData = JSON.stringify(allVertices);
        const dataBlob = new Blob([jsonVertData], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vertices.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    (xhr) => {
        console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
    },
    (error) => {
        console.error('An error happened', error);
    }
)


// Position the camera
camera.position.set(0, 3, 0);

// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.25;
controls.enableZoom = true;

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  controls.update();

  // Render the scene
  renderer.render(scene, camera);
}

// Start the animation
animate();