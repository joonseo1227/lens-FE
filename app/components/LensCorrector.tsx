"use client";

import React, {useCallback, useEffect, useRef, useState} from "react";

const LensCorrector = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [strength, setStrength] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [fileName, setFileName] = useState("corrected-image.png");

    // WebGL context refs to avoid re-initializing unnecessarily
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);

    // Shader sources
    const vsSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texCoord = a_texCoord;
    }
  `;

    const fsSource = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform float u_strength;
    uniform float u_zoom;
    varying vec2 v_texCoord;

    void main() {
      // Center coordinates (-0.5 to 0.5)
      vec2 coord = v_texCoord - 0.5;
      
      // Apply zoom (divide coord by zoom factor)
      // We do this BEFORE distortion so we are distorting the zoomed visible area
      // OR we can do it after. Let's do it effectively by scaling the coordinates we look up.
      // Actually standard lens distortion is on the physical sensor plane. 
      // Let's simpler: distort first, then scale? Or scale then distort?
      // Usually you want to zoom IN to remove black borders caused by pin-cushion (negative strength).
      
      float r2 = dot(coord, coord);
      
      // Brown-Conrady model simplified: r_distorted = r_undistorted * (1 + k * r^2 + ...)
      // We implement the reverse mapping for sampling: look up "dest" pixels in "source" texture.
      // If u_strength is POSITIVE (Barrel), we want to pull pixels from further out IN (fish eye).
      // If we are looking for where to sample (inverse map), for barrel we need to sample from *closer* to center?
      // Let's stick to standard formula: p_new = p * (1 + k * r2).
      
      vec2 dist_coord = coord * (1.0 + u_strength * r2);
      
      // Apply zoom correction (scale down the coordinate to zoom in)
      vec2 final_coord = dist_coord / u_zoom;
      
      // Map back to 0..1
      vec2 uv = final_coord + 0.5;

      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Transparent/Black
      } else {
        gl_FragColor = texture2D(u_image, uv);
      }
    }
  `;

    const initWebGL = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext("webgl", {preserveDrawingBuffer: true});
        if (!gl) return;
        glRef.current = gl;

        // Create Shaders
        const createShader = (type: number, source: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error("Shader compile error:", gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = createShader(gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        // Create Program
        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(program));
            return;
        }
        programRef.current = program;

        // Buffers (Full screen quad)
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW
        );

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
            gl.STATIC_DRAW
        );

        // Setup Attributes
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(texCoordLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    }, [fsSource, vsSource]);

    const loadTexture = useCallback((img: HTMLImageElement) => {
        const gl = glRef.current;
        if (!gl) return;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Parameters for NPOT textures (No mips, repeat clamp)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        textureRef.current = texture;
    }, []);

    const render = useCallback(() => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program || !image) return;

        // Resize canvas to match image aspect ratio, but max width of container
        const container = containerRef.current;
        if (container) {
            // We want the canvas resolution to match the image resolution for high quality export
            if (canvasRef.current && (canvasRef.current.width !== image.width || canvasRef.current.height !== image.height)) {
                canvasRef.current.width = image.width;
                canvasRef.current.height = image.height;
            }
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }

        gl.useProgram(program);

        const strengthLoc = gl.getUniformLocation(program, "u_strength");
        const zoomLoc = gl.getUniformLocation(program, "u_zoom");

        gl.uniform1f(strengthLoc, strength);
        gl.uniform1f(zoomLoc, zoom);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }, [image, strength, zoom]);

    useEffect(() => {
        initWebGL();
    }, [initWebGL]);

    useEffect(() => {
        if (image) {
            loadTexture(image);
            render();
        }
    }, [image, loadTexture, render]);

    useEffect(() => {
        render();
    }, [strength, zoom, render]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFileName(file.name.replace(/\.[^/.]+$/, "") + "-corrected.png");
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    setImage(img);
                    // Reset controls
                    setStrength(0);
                    setZoom(1);
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const link = document.createElement("a");
            link.download = fileName;
            link.href = canvas.toDataURL("image/png");
            link.click();
        }
    };

    return (
        <div
            className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mx-auto p-4 lg:p-8 animate-in fade-in duration-500">
            {/* Canvas Area */}
            <div
                ref={containerRef}
                className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden relative min-h-[400px] flex items-center justify-center shadow-2xl backdrop-blur-sm"
            >
                {!image && (
                    <div className="text-center p-8 absolute inset-0 flex flex-col items-center justify-center">
                        <div
                            className="w-16 h-16 mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M8 12a4 4 0 1 0 8 0"/>
                            </svg>
                        </div>
                        <p className="text-zinc-400 text-lg font-medium">Upload an image to start</p>
                        <p className="text-zinc-600 text-sm mt-2">Supports JPG, PNG (High Resolution)</p>
                        <label
                            className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-medium cursor-pointer transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-900/20">
                            Choose File
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden"/>
                        </label>
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className={`max-w-full max-h-[80vh] object-contain shadow-2xl ${!image ? 'hidden' : ''}`}
                />
            </div>

            {/* Controls Area */}
            <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
                {/* Upload Button (Visible when image exists for quick swap) */}
                {image && (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
                        <label
                            className="flex items-center justify-center w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium cursor-pointer transition-colors border border-zinc-700 hover:border-zinc-600">
                            <span className="mr-2">Replace Image</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" x2="12" y1="3" y2="15"/>
                            </svg>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden"/>
                        </label>
                    </div>
                )}

                {/* Adjustments */}
                <div
                    className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col gap-8">
                    <div>
                        <h3 className="text-zinc-100 font-semibold text-lg mb-1">Distortion</h3>
                        <p className="text-zinc-500 text-sm mb-4">Correct barrel or pincushion effect</p>
                        <div className="flex items-center gap-4">
                            <span
                                className="text-xs text-zinc-500 font-mono w-8 text-right">{(strength).toFixed(2)}</span>
                            <input
                                type="range"
                                min="-2.0"
                                max="2.0"
                                step="0.01"
                                value={strength}
                                onChange={(e) => setStrength(parseFloat(e.target.value))}
                                disabled={!image}
                                className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 hover:bg-zinc-600 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <h3 className="text-zinc-100 font-semibold text-lg mb-1">Zoom / Crop</h3>
                        <p className="text-zinc-500 text-sm mb-4">Remove empty edges</p>
                        <div className="flex items-center gap-4">
                            <span className="text-xs text-zinc-500 font-mono w-8 text-right">{(zoom).toFixed(2)}</span>
                            <input
                                type="range"
                                min="0.5"
                                max="3.0"
                                step="0.01"
                                value={zoom}
                                onChange={(e) => setZoom(parseFloat(e.target.value))}
                                disabled={!image}
                                className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-50 hover:bg-zinc-600 transition-colors"
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            setStrength(0);
                            setZoom(1);
                        }}
                        disabled={!image}
                        className="text-xs text-zinc-500 hover:text-zinc-300 self-end transition-colors"
                    >
                        Reset Values
                    </button>
                </div>

                {/* Download */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
                    <button
                        onClick={handleDownload}
                        disabled={!image}
                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        <span>Save Image</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" x2="12" y1="15" y2="3"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LensCorrector;
