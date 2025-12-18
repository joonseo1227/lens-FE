"use client";

import React, {useCallback, useEffect, useRef, useState} from "react";

// --- Types ---
interface ImageLayer {
    id: string;
    name: string;
    image: HTMLImageElement;
    texture: WebGLTexture | null;
    // Position/Transform
    x: number; // Screen pixels (center)
    y: number; // Screen pixels (center)
    width: number; // Original pixels
    height: number;// Original pixels
    scale: number;
    rotation: number; // Radians
    // Effects
    distortion: number; // -1 to 1 (or more)
    opacity: number;    // 0 to 1
    zIndex: number;
}

// --- Matrix Math Helpers for WebGL ---
// Simple 3x3 matrix for 2D transformations [ a, b, 0, c, d, 0, tx, ty, 1 ]
function m3_projection(width: number, height: number) {
    // Note: This maps 0..width to -1..1 (flipped Y for typical 2D? no WebGL is -1 bottom, 1 top)
    // Let's standard: 0,0 is top-left in screen pixels usually. 
    // Map 0 -> -1, width -> 1
    // x' = (x / width) * 2 - 1
    // y' = 1 - (y / height) * 2  (flip Y so 0 is top)
    return [
        2 / width, 0, 0,
        0, -2 / height, 0,
        -1, 1, 1,
    ];
}

function m3_translation(tx: number, ty: number) {
    return [
        1, 0, 0,
        0, 1, 0,
        tx, ty, 1,
    ];
}

function m3_rotation(angleInRadians: number) {
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    return [
        c, -s, 0,
        s, c, 0,
        0, 0, 1,
    ];
}

function m3_scale(sx: number, sy: number) {
    return [
        sx, 0, 0,
        0, sy, 0,
        0, 0, 1,
    ];
}

function m3_multiply(a: number[], b: number[]) {
    const a00 = a[0 * 3 + 0];
    const a01 = a[0 * 3 + 1];
    const a02 = a[0 * 3 + 2];
    const a10 = a[1 * 3 + 0];
    const a11 = a[1 * 3 + 1];
    const a12 = a[1 * 3 + 2];
    const a20 = a[2 * 3 + 0];
    const a21 = a[2 * 3 + 1];
    const a22 = a[2 * 3 + 2];
    const b00 = b[0 * 3 + 0];
    const b01 = b[0 * 3 + 1];
    const b02 = b[0 * 3 + 2];
    const b10 = b[1 * 3 + 0];
    const b11 = b[1 * 3 + 1];
    const b12 = b[1 * 3 + 2];
    const b20 = b[2 * 3 + 0];
    const b21 = b[2 * 3 + 1];
    const b22 = b[2 * 3 + 2];
    return [
        b00 * a00 + b01 * a10 + b02 * a20,
        b00 * a01 + b01 * a11 + b02 * a21,
        b00 * a02 + b01 * a12 + b02 * a22,
        b10 * a00 + b11 * a10 + b12 * a20,
        b10 * a01 + b11 * a11 + b12 * a21,
        b10 * a02 + b11 * a12 + b12 * a22,
        b20 * a00 + b21 * a10 + b22 * a20,
        b20 * a01 + b21 * a11 + b22 * a21,
        b20 * a02 + b21 * a12 + b22 * a22,
    ];
}


// --- Shaders ---
const VS_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;

uniform mat3 u_matrix;

varying vec2 v_texCoord;

void main() {
  // Apply transformation matrix
  vec3 pos = u_matrix * vec3(a_position, 1);
  gl_Position = vec4(pos.xy, 0, 1);
  v_texCoord = a_texCoord;
}
`;

const FS_SOURCE = `
precision mediump float;

varying vec2 v_texCoord;

uniform sampler2D u_image;
uniform float u_distortion;
uniform float u_opacity;

void main() {
  vec2 coord = v_texCoord - 0.5;
  float r2 = dot(coord, coord);
  
  // Distortion formula: new_pos = pos * (1 + k * r^2)
  vec2 dist_coord = coord * (1.0 + u_distortion * r2);
  
  vec2 uv = dist_coord + 0.5;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    discard; // Transparent
  } else {
    vec4 color = texture2D(u_image, uv);
    gl_FragColor = vec4(color.rgb, color.a * u_opacity);
  }
}
`;


const PanoramaEditor = () => {
    // --- Refs ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);

    // --- State ---
    const [layers, setLayers] = useState<ImageLayer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

    // For dragging
    const [isDragging, setIsDragging] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    const [dragStart, setDragStart] = useState({x: 0, y: 0});
    const [initialPos, setInitialPos] = useState({x: 0, y: 0});
    const [initialView, setInitialView] = useState({x: 0, y: 0});

    const [canvasSize, setCanvasSize] = useState({w: 800, h: 600});
    // View transform (pan/zoom the whole workspace)
    const [view, setView] = useState({x: 0, y: 0, scale: 1});

    // --- Key Listeners (Spacebar) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" && !e.repeat && (e.target as HTMLElement).tagName !== "INPUT") {
                e.preventDefault();
                setIsSpacePressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space") setIsSpacePressed(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, []);

    // --- Wheel Listener (Pinch Zoom & Pan) ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            // Check for Pinch (Ctrl Key or Trackpad specific)
            // Most browsers set ctrlKey = true for pinch gestures
            if (e.ctrlKey) {
                // ZOOM
                const zoomIntensity = 0.01;
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                setView(prevView => {
                    const delta = -e.deltaY; // Up is zoom in
                    const scaleFactor = Math.exp(delta * zoomIntensity);

                    // Clamp Check (optional, but good for safety)
                    let newScale = prevView.scale * scaleFactor;
                    newScale = Math.max(0.1, Math.min(newScale, 10)); // Min 10%, Max 1000%

                    const worldX = (mouseX - prevView.x) / prevView.scale;
                    const worldY = (mouseY - prevView.y) / prevView.scale;

                    const newX = mouseX - worldX * newScale;
                    const newY = mouseY - worldY * newScale;

                    return {x: newX, y: newY, scale: newScale};
                });

            } else {
                // PAN (Two finger scroll)
                setView(prevView => ({
                    ...prevView,
                    x: prevView.x - e.deltaX,
                    y: prevView.y - e.deltaY
                }));
            }
        };

        // Add non-passive listener to prevent browser default pinch/scroll
        canvas.addEventListener('wheel', handleWheel, {passive: false});

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        }
    }, []); // Empty dep array is fine as we use functional setView updates


    // --- Init WebGL ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Init Context
        const gl = canvas.getContext("webgl", {
            premultipliedAlpha: false,
            alpha: true,
            preserveDrawingBuffer: true
        });
        if (!gl) return;
        glRef.current = gl;

        // Compile Shaders
        const createShader = (type: number, src: string) => {
            const shader = gl.createShader(type);
            if (!shader) return null;
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
        const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
        if (!vs || !fs) return;

        const program = gl.createProgram();
        if (!program) return;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program));
            return;
        }
        programRef.current = program;

        // Buffer Setup (Unit Quad centered at 0,0)
        // Vertices: -0.5 to 0.5
        const positions = new Float32Array([
            -0.5, -0.5,
            0.5, -0.5,
            -0.5, 0.5,
            -0.5, 0.5,
            0.5, -0.5,
            0.5, 0.5,
        ]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            0, 0,
            1, 1,
            1, 0,
        ]);
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

        // Bind attributes permanently for this simple program
        const positionLoc = gl.getAttribLocation(program, "a_position");
        const texCoordLoc = gl.getAttribLocation(program, "a_texCoord");

        gl.enableVertexAttribArray(positionLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(texCoordLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        // Blend Mode
        gl.enable(gl.BLEND);
        // Alpha blending: Source Over
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Flip Y for texture uploads to match our Y-down projection
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    }, []);

    // --- Helper to Create Texture ---
    const createTexture = (image: HTMLImageElement) => {
        const gl = glRef.current;
        if (!gl) return null;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        return texture;
    };

    // --- File Upload ---
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const img = new Image();
                    img.onload = () => {
                        const tex = createTexture(img);
                        const newLayer: ImageLayer = {
                            id: Math.random().toString(36).substr(2, 9),
                            name: file.name,
                            image: img,
                            texture: tex,
                            x: canvasSize.w / 2, // Start in center
                            y: canvasSize.h / 2,
                            width: img.width,
                            height: img.height,
                            scale: 0.5, // Start smaller so it fits
                            rotation: 0,
                            distortion: 0,
                            opacity: 0.8, // Start slightly transparent to see overlaps
                            zIndex: layers.length + 1
                        };
                        setLayers(prev => [...prev, newLayer]);
                        setActiveLayerId(newLayer.id);
                    };
                    img.src = evt.target?.result as string;
                };
                reader.readAsDataURL(file);
            });
        }
    };

    // --- Resize Obsevrer ---
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const {width, height} = entry.contentRect;
                setCanvasSize({w: width, h: height});
                if (canvasRef.current) {
                    canvasRef.current.width = width;
                    canvasRef.current.height = height;
                }
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // --- Render Loop ---
    const render = useCallback(() => {
        const gl = glRef.current;
        const program = programRef.current;
        if (!gl || !program) return;

        // Clear
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 0); // Transparent to show CSS grid
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        // Sort layers
        const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

        // Projection Matrix (Screen Space)
        const projection = m3_projection(gl.drawingBufferWidth, gl.drawingBufferHeight);

        // View Matrix (Pan/Zoom canvas)
        // We apply this "globally" to all layers
        // T_view * S_view
        let matrix = m3_translation(view.x, view.y);
        matrix = m3_multiply(matrix, m3_scale(view.scale, view.scale));
        // projection * view
        const viewProjection = m3_multiply(projection, matrix);


        sorted.forEach(layer => {
            if (!layer.texture) return;
            gl.bindTexture(gl.TEXTURE_2D, layer.texture);

            // Calculate Model Matrix
            // Since our quad is 1x1 centered at 0,0:
            // 1. Scale to Image Size * Layer Scale
            // 2. Rotate
            // 3. Translate to Layer Position

            let m = m3_translation(layer.x, layer.y);
            m = m3_multiply(m, m3_rotation(layer.rotation));
            m = m3_multiply(m, m3_scale(layer.width * layer.scale, layer.height * layer.scale));

            // Combine
            const finalMatrix = m3_multiply(viewProjection, m);

            // Set Uniforms
            const matrixLoc = gl.getUniformLocation(program, "u_matrix");
            const distortionLoc = gl.getUniformLocation(program, "u_distortion");
            const opacityLoc = gl.getUniformLocation(program, "u_opacity");

            gl.uniformMatrix3fv(matrixLoc, false, finalMatrix);
            gl.uniform1f(distortionLoc, layer.distortion);
            gl.uniform1f(opacityLoc, layer.opacity);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
        });

    }, [layers, view]);

    useEffect(() => {
        requestAnimationFrame(render);
    }, [render]);


    // --- Updating Specific Layer ---
    const updateLayer = (id: string, updates: Partial<ImageLayer>) => {
        setLayers(prev => prev.map(l => l.id === id ? {...l, ...updates} : l));
    };

    const activeLayer = layers.find(l => l.id === activeLayerId);

    // --- Mouse Interaction ---
    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        // Panning Triggers
        const isMiddleClick = e.button === 1;
        const isPanTrigger = isSpacePressed || isMiddleClick;

        if (isPanTrigger) {
            setIsPanning(true);
            setDragStart({x: e.clientX, y: e.clientY});
            setInitialView({x: view.x, y: view.y});
            return;
        }

        // Mouse in "Canvas Space" (0,0 is top-left of canvas element)
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Convert to "World Space" (Apply View Transform Inverse)
        // View: T * S
        // Inverse: S^-1 * T^-1
        // (mx - view.x) / view.scale
        const wx = (mx - view.x) / view.scale;
        const wy = (my - view.y) / view.scale;

        // Hit Test (Top to Bottom)
        const sortedReverse = [...layers].sort((a, b) => b.zIndex - a.zIndex);
        let hitLayerId: string | null = null;

        for (const layer of sortedReverse) {
            // We need to check if point (wx, wy) is inside the transformed quad of the layer.
            // Layer transform is: Translate(x,y) * Rotate(r) * Scale(w*s, h*s) * Quad(-0.5..0.5)

            // Inverse Transform to get back to Unit Quad Space (-0.5 to 0.5):
            // 1. Translate (-x, -y)
            const lx1 = wx - layer.x;
            const ly1 = wy - layer.y; // Y is down in our screen space logic

            // 2. Rotate (-r)
            // x' = x*cos(-r) - y*sin(-r)
            // y' = x*sin(-r) + y*cos(-r)
            const cos = Math.cos(-layer.rotation);
            const sin = Math.sin(-layer.rotation);
            const lx2 = lx1 * cos - ly1 * sin;
            const ly2 = lx1 * sin + ly1 * cos;

            // 3. Scale Inverse (1 / (width * scale))
            // The quad is size 1x1 (-0.5 to 0.5), but we scaled it by (width*scale, height*scale)
            const localX = lx2 / (layer.width * layer.scale);
            const localY = ly2 / (layer.height * layer.scale);

            // Check bounds (-0.5 to 0.5)
            if (Math.abs(localX) <= 0.5 && Math.abs(localY) <= 0.5) {
                hitLayerId = layer.id;
                break;
            }
        }

        if (hitLayerId) {
            setActiveLayerId(hitLayerId);
            setIsDragging(true);
            setDragStart({x: e.clientX, y: e.clientY});
            const layer = layers.find(l => l.id === hitLayerId);
            if (layer) setInitialPos({x: layer.x, y: layer.y});
        } else {
            // Deselect and Pan
            setActiveLayerId(null);
            setIsPanning(true);
            setDragStart({x: e.clientX, y: e.clientY});
            setInitialView({x: view.x, y: view.y});
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setView(v => ({
                ...v,
                x: initialView.x + dx,
                y: initialView.y + dy
            }));
        } else if (isDragging && activeLayerId) {
            const dx = (e.clientX - dragStart.x) / view.scale; // Adjust for view zoom
            const dy = (e.clientY - dragStart.y) / view.scale;
            updateLayer(activeLayerId, {
                x: initialPos.x + dx,
                y: initialPos.y + dy
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setIsPanning(false);
    };

    // --- Canvas Panning (Middle Click / Space+Drag) ---
    // Let's implement panning via Middle Click or Space bar later if needed.

    const fitToScreen = () => {
        if (layers.length === 0) {
            setView({x: 0, y: 0, scale: 1});
            return;
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        layers.forEach(layer => {
            // Corners of unit quad centered at 0,0
            const corners = [
                {x: -0.5, y: -0.5},
                {x: 0.5, y: -0.5},
                {x: 0.5, y: 0.5},
                {x: -0.5, y: 0.5},
            ];

            corners.forEach(corner => {
                // 1. Scale
                let x = corner.x * layer.width * layer.scale;
                let y = corner.y * layer.height * layer.scale;

                // 2. Rotate
                const cos = Math.cos(layer.rotation);
                const sin = Math.sin(layer.rotation);
                // Standard 2D rotation: x' = x cos - y sin, y' = x sin + y cos
                const rx = x * cos - y * sin;
                const ry = x * sin + y * cos;

                // 3. Translate
                const wx = rx + layer.x;
                const wy = ry + layer.y;

                if (wx < minX) minX = wx;
                if (wx > maxX) maxX = wx;
                if (wy < minY) minY = wy;
                if (wy > maxY) maxY = wy;
            });
        });

        const boundsW = maxX - minX;
        const boundsH = maxY - minY;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const padding = 50;
        const availW = canvasSize.w - padding * 2;
        const availH = canvasSize.h - padding * 2;

        const scaleW = availW / boundsW;
        const scaleH = availH / boundsH;

        let newScale = Math.min(scaleW, scaleH);

        // Safety check
        if (!isFinite(newScale) || newScale === 0) newScale = 1;

        // Pan to center
        // Center of screen (CW/2, CH/2) should define World(Center)
        // Screen = World * Scale + Pan
        // Pan = Screen - World * Scale
        const newX = (canvasSize.w / 2) - (centerX * newScale);
        const newY = (canvasSize.h / 2) - (centerY * newScale);

        setView({x: newX, y: newY, scale: newScale});
    };

    const deleteLayer = (id: string) => {
        setLayers(prev => prev.filter(l => l.id !== id));
        if (activeLayerId === id) setActiveLayerId(null);
    }

    const downloadCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            render(); // Ensure fresh paint
            const link = document.createElement('a');
            link.download = 'panorama-stitch.png';
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
        }
    }


    return (
        <div className="flex h-full w-full bg-black text-zinc-100 font-sans">
            {/* Sidebar Controls */}
            <div className="w-80 border-r border-zinc-800 bg-zinc-900/90 backdrop-blur-md flex flex-col z-10">
                <div className="p-4 border-b border-zinc-800">
                    <h2 className="font-bold text-lg mb-4">Panorama Tools</h2>
                    <label
                        className="flex items-center justify-center w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium cursor-pointer transition-colors shadow-lg shadow-blue-900/20">
                        <span className="mr-2">+ Add Images</span>
                        <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden"/>
                    </label>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {/* Active Layer Controls */}
                    {activeLayer ? (
                        <div className="flex flex-col gap-4">
                            <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Adjust
                                Selected Layer</h3>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Distortion</span>
                                    <span className="font-mono">{activeLayer.distortion.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range" min="-2.0" max="2.0" step="0.01"
                                    value={activeLayer.distortion}
                                    onChange={(e) => updateLayer(activeLayer.id, {distortion: parseFloat(e.target.value)})}
                                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Opacity</span>
                                    <span className="font-mono">{activeLayer.opacity.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range" min="0" max="1" step="0.01"
                                    value={activeLayer.opacity}
                                    onChange={(e) => updateLayer(activeLayer.id, {opacity: parseFloat(e.target.value)})}
                                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Scale</span>
                                    <span className="font-mono">{activeLayer.scale.toFixed(2)}</span>
                                </div>
                                <input
                                    type="range" min="0.1" max="3" step="0.01"
                                    value={activeLayer.scale}
                                    onChange={(e) => updateLayer(activeLayer.id, {scale: parseFloat(e.target.value)})}
                                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between text-xs text-zinc-400">
                                    <span>Rotation</span>
                                    <span
                                        className="font-mono">{(activeLayer.rotation * 180 / Math.PI).toFixed(0)}°</span>
                                </div>
                                <input
                                    type="range" min={-Math.PI} max={Math.PI} step="0.01"
                                    value={activeLayer.rotation}
                                    onChange={(e) => updateLayer(activeLayer.id, {rotation: parseFloat(e.target.value)})}
                                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>


                        </div>
                    ) : (
                        <div className="text-zinc-600 text-sm text-center py-8">Select a layer to edit</div>
                    )}

                    <hr className="border-zinc-800 my-2"/>


                    {/* Layer List */}
                    <div>
                        <h3 className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-2">Layers</h3>
                        <div className="flex flex-col gap-2"
                             onDragOver={(e) => e.preventDefault()}
                        >
                            {[...layers].sort((a, b) => b.zIndex - a.zIndex).map((layer, index, arr) => (
                                <div
                                    key={layer.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData("text/plain", layer.id);
                                        e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const draggedId = e.dataTransfer.getData("text/plain");
                                        if (draggedId === layer.id) return;

                                        const newLayers = [...layers];
                                        // Sort current layers by Z (desc) to match UI
                                        const sorted = newLayers.sort((a, b) => b.zIndex - a.zIndex);

                                        const fromIndex = sorted.findIndex(l => l.id === draggedId);
                                        const toIndex = index; // The index in the sorted list we dropped on

                                        if (fromIndex === -1) return;

                                        // Move item in the sorted array
                                        const [item] = sorted.splice(fromIndex, 1);
                                        sorted.splice(toIndex, 0, item);

                                        // Re-assign Z-Index based on new order (Top of list = High Z)
                                        // List index 0 => Highest Z => (length)
                                        // List index N => Lowest Z => 1
                                        sorted.forEach((l, i) => {
                                            l.zIndex = sorted.length - i;
                                        });

                                        setLayers([...sorted]); // Trigger re-render with new Z values
                                    }}
                                    onClick={() => setActiveLayerId(layer.id)}
                                    className={`flex items-center gap-2 p-2 rounded-lg cursor-move transition-all border ${activeLayerId === layer.id
                                        ? 'bg-zinc-800 border-blue-500/50'
                                        : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'
                                    }`}
                                >
                                    <div
                                        className="w-10 h-10 bg-zinc-950 rounded overflow-hidden relative shrink-0 pointer-events-none">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={layer.image.src} className="object-cover w-full h-full opacity-70"
                                             alt="thumb"/>
                                    </div>
                                    <div className="flex-1 min-w-0 pointer-events-none">
                                        <div className="text-sm font-medium truncate text-zinc-200">{layer.name}</div>
                                        <div className="text-xs text-zinc-500">ID: {layer.id.substr(0, 4)}</div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteLayer(layer.id);
                                        }}
                                        className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-900 rounded cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            {layers.length === 0 && (
                                <p className="text-xs text-zinc-600 text-center py-2">No layers yet</p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-zinc-800 bg-zinc-900">
                    <button
                        onClick={downloadCanvas}
                        disabled={layers.length === 0}
                        className="w-full py-2.5 bg-zinc-200 hover:bg-white text-black rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
                    >
                        Export Panorama
                    </button>
                </div>
            </div>

            {/* Main Canvas Area */}
            <div
                className="flex-1 relative overflow-hidden bg-[radial-gradient(#333_1px,transparent_1px)]"
                ref={containerRef}
                style={{
                    backgroundPosition: `${view.x}px ${view.y}px`,
                    backgroundSize: `${20 * view.scale}px ${20 * view.scale}px`
                }}
            >
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                    <div
                        className="bg-zinc-900/80 backdrop-blur border border-zinc-800 p-1.5 rounded-lg flex items-center gap-2">
                        <button onClick={() => setView(v => ({...v, scale: v.scale * 1.1}))}
                                className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200">+
                        </button>
                        <span
                            className="text-xs font-mono text-zinc-400 w-12 text-center">{(view.scale * 100).toFixed(0)}%</span>
                        <button onClick={() => setView(v => ({...v, scale: v.scale / 1.1}))}
                                className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-200">-
                        </button>
                    </div>
                    <button
                        onClick={fitToScreen}
                        className="px-3 py-1.5 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                    >
                        Fit to All
                    </button>
                    <button
                        onClick={() => setView({x: 0, y: 0, scale: 1})}
                        className="px-3 py-1.5 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                    >
                        Reset View
                    </button>
                </div>

                <div className="absolute bottom-4 right-4 z-10 pointer-events-none opacity-50">
                    <div className="text-[10px] text-zinc-600 font-mono">
                        Canvas: {canvasSize.w} x {canvasSize.h} | Selection: {activeLayerId ? activeLayerId : 'None'}
                    </div>
                </div>

                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    className={`block ${isPanning ? 'cursor-grabbing' :
                        isSpacePressed ? 'cursor-grab' :
                            'cursor-default'
                    }`}
                />
            </div>
        </div>
    );
};

export default PanoramaEditor;
