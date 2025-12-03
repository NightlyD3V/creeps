import * as THREE from 'three'
// import { Pass, FullScreenQuad } from 'three/build/three.webgpujs';

export function Fog(scene,camera, renderer, Pass) {
   class VolumetricFogPass extends Pass {
    constructor(scene, camera) {
        super();
        this.scene = scene;
        this.camera = camera;
        this.needsSwap = true;

        // Create the node material for the fog shader using TSL
        this.material = this.createFogMaterial();

        this.quad = new FullScreenQuad(this.material);
    }

    createFogMaterial() {
        const { tslFn, texture, uv, vec4, vec3, float, int, loop, uniform, cameraPosition, inverse, multiply, add, exp, nodeObject } = THREE; // Import TSL helpers

        // Uniforms for fog properties
        const fogDensity = uniform(0.005); // Adjust for fog thickness
        const fogColor = uniform(new THREE.Color(0xaaaaaa)); // Fog color
        const stepCount = uniform(32); // Number of march steps; higher = better quality, slower
        const stepSize = uniform(0.5); // Step size in world units

        // Assume you have color and depth textures from previous render (PostProcessing provides them)
        const colorTexture = uniform(null); // Will set later
        const depthTexture = uniform(null); // Will set later

        const fogFn = tslFn(() => {
        const coord = uv();

        // Sample scene color and depth
        const sceneColor = texture(colorTexture, coord).rgb;
        const depth = texture(depthTexture, coord).r;

        // Reconstruct world position from depth (need helper function)
        const clipPos = vec4(coord.mul(2.0).sub(1.0), depth, 1.0);
        const worldPos = inverse(multiply(camera.projectionMatrix, camera.matrixWorld)).mul(clipPos).xyz;

        const rayDir = worldPos.sub(cameraPosition).normalize();
        const rayLength = worldPos.sub(cameraPosition).length();

        // Ray marching
        let transmittance = float(1.0);
        let scatteredLight = vec3(0.0);

        const marchStep = rayLength.div(stepCount.toFloat());
        let currentPos = cameraPosition.add(rayDir.mul(0.5 * marchStep)); // Start slightly offset

        loop({ start: int(0), end: stepCount, type: 'int', name: 'i' }, ({ i }) => {
            // Simple uniform density; replace with noise or 3D texture sample for varied fog
            const density = fogDensity;

            transmittance = transmittance.mul(exp(density.negate().mul(marchStep)));

            // Basic in-scattering (add light sampling here for better effect, e.g., from directional lights)
            const lightIntensity = vec3(0.2); // Placeholder; sample lights/shadows for realism
            scatteredLight = scatteredLight.add(fogColor.mul(lightIntensity).mul(density).mul(marchStep).mul(transmittance));
            
            currentPos = currentPos.add(rayDir.mul(marchStep));
        });

        // Combine with scene color
        const finalColor = sceneColor.mul(transmittance).add(scatteredLight);

        return vec4(finalColor, 1.0);
        });

        const material = new THREE.ShaderNodeMaterial({
        fragmentNode: fogFn().rgb,
        depthTest: false,
        depthWrite: false,
        transparent: true
        });

        // Expose uniforms for control
        material.uniforms = { fogDensity, fogColor, stepCount, stepSize, colorTexture, depthTexture };

        return material;
    }

    render(renderer, writeBuffer, readBuffer) {
        // Set textures from previous pass
        this.material.uniforms.colorTexture.value = readBuffer.texture;
        this.material.uniforms.depthTexture.value = readBuffer.depthTexture; // Ensure depth is enabled in renderer

        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
        this.quad.render(renderer);
    }
    }
}