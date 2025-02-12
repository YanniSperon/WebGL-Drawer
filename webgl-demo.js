
class Profiler {
  static profileFunction(desc, fn, ...args) {
    if (typeof fn !== "function") {
      throw new TypeError("First argument must be a function");
    }

    const start = performance.now();

    const result = fn(...args);

    const end = performance.now();
    console.log(`${desc}: ${(end - start).toFixed(3)} ms`);

    return result;
  }

  constructor() {
    this.startTime = null;
    this.lastCheckedTime = null;

    this.initializeProfiling();
  }

  initializeProfiling() {
    this.startTime = performance.now();
    this.lastCheckedTime = this.startTime;
  }

  printStatsSinceStart(desc) {
    const currTime = performance.now();
    console.log(`${desc}: ${(currTime - this.startTime).toFixed(3)} ms`);
    this.lastCheckedTime = currTime;
  }

  printStatsSinceLast(desc) {
    const currTime = performance.now();
    console.log(`${desc}: ${(currTime - this.lastCheckedTime).toFixed(3)} ms`);
    this.lastCheckedTime = currTime;
  }
}

class GLDrawShaderSourceGenerator {
  static getDrawVertexShaderSrc() {
    return `
    precision mediump float;
    
    attribute vec4 aPosition;
    attribute vec2 aTexCoord;
    
    varying vec2 vTexCoord;
    
    void main() {
      gl_Position = aPosition;
      vTexCoord = aTexCoord;
    }`;
  }

  static getDrawFragmentShaderSrc() {
    return `
    precision mediump float;
    
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    
    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }`;
  }
}

class GLRenderShaderSourceGenerator {
  // isLines can be true or false
  static getDistFunction(isLines) {
    if (isLines) {
      return `
      float getDistance(vec2 point, vec2 lineStart, vec2 lineEnd) {
        vec2 lineVector = lineEnd - lineStart;
        vec2 pointVector = point - lineStart;
        float t = clamp(dot(pointVector, lineVector) / dot(lineVector, lineVector), 0.0, 1.0);
        vec2 closestPoint = lineStart + t * lineVector;
        return length(point - closestPoint);
      }`;
    } else {
      return `
      float getDistance(vec2 fragPos, vec2 pointPos) {
        return length(fragPos - pointPos);
      }`;
    }
  }

  static getMultipleRenderVertexShaderSrc() {
    return `
    precision mediump float;
    
    attribute vec4 aPosition;
    attribute vec2 aTexCoord;
    
    varying vec2 vTexCoord;
    
    void main() {
      gl_Position = aPosition;
      vTexCoord = aTexCoord;
    }`;
  }

  static getMultipleRenderFragmentShaderSrc(isLines, screenWidth, screenHeight, maxFragmentUniformVectors) {
    return `
    #define SCREEN_WIDTH ` + screenWidth + `
    #define SCREEN_HEIGHT ` + screenHeight + `
    #define POSITIONS_SIZE ` + (Math.max(maxFragmentUniformVectors - 5, 1)) + `
    precision mediump float;
    
    varying vec2 vTexCoord;
    uniform sampler2D uTexture;
    
    uniform vec2 uPositions[POSITIONS_SIZE];
    ` + (isLines ? `uniform vec2 uLastPosition;` : ``) + `
    
    uniform float uRadiusSquared;
    uniform vec3 uStartingColor;
    uniform vec3 uColorDecrement;
    
    ` + GLRenderShaderSourceGenerator.getDistFunction(isLines) + `
    
    vec4 determineColor(vec4 existingColor, float dist2) {
      // Smooth step function to transition between color states without branching.
      float isClose = step(dist2, uRadiusSquared);
      float isEmpty = step(0.01, existingColor.a);  // 1.0 if alpha > 0.01, otherwise 0.0

      // Calculate new color components with no conditionals.
      vec3 newColor = mix(uStartingColor, max(existingColor.rgb - uColorDecrement, vec3(0.0)), isEmpty);
    
      return mix(existingColor, vec4(newColor, 1.0), isClose);
    }
    
    void main() {
      vec2 normalizedPos = vTexCoord * vec2(SCREEN_WIDTH, SCREEN_HEIGHT);
      vec4 existingColor = texture2D(uTexture, vTexCoord);
      ` + (isLines ? `vec2 lastPos = uLastPosition;` : ``) + `
    
      for (int i = 0; i < POSITIONS_SIZE; ++i) {
        ` + (isLines ? `float dist = getDistance(normalizedPos, lastPos, uPositions[i]);` : `float dist = getDistance(normalizedPos, uPositions[i]);`) + `
        float dist2 = dist * dist;
        existingColor = determineColor(existingColor, dist2);
        ` + (isLines ? `lastPos = uPositions[i];` : ``) + `
      }

      gl_FragColor = existingColor;
    }`;
  }
}

class GLShader {
  static createShaderGL(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Error compiling shader: ", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  constructor(gl, vertSrc, fragSrc) {
    this.gl = gl;

    this.vertSrc = vertSrc;
    this.fragSrc = fragSrc;

    this.vertexShader = null;
    this.fragmentShader = null;
    this.program = null;

    this.updated = false;

    this.uniformLocationCache = new Map();
  }

  delete() {
    if (this.program !== null) {
      this.gl.deleteShader(this.vertexShader);
      this.gl.deleteShader(this.fragmentShader);
      this.gl.deleteProgram(this.program);
      this.updated = false;
    }
  }

  setNewFragSource(fragSrc) {
    this.fragSrc = fragSrc;
    this.updated = false;
  }

  setNewVertSource(vertSrc) {
    this.vertSrc = vertSrc;
    this.updated = false;
  }

  generate() {
    this.delete();

    this.vertexShader = GLShader.createShaderGL(this.gl, this.gl.VERTEX_SHADER, this.vertSrc);
    this.fragmentShader = GLShader.createShaderGL(this.gl, this.gl.FRAGMENT_SHADER, this.fragSrc);

    // Create the shader program
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, this.vertexShader);
    this.gl.attachShader(this.program, this.fragmentShader);
    this.gl.linkProgram(this.program);
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error("Error linking program: ", this.gl.getProgramInfoLog(this.program));
      this.gl.deleteProgram(this.program);
      return;
    }
    this.gl.useProgram(this.program);

    this.gl.useProgram(null);

    this.updated = true;
  }

  getProgram() {
    if (!this.updated) {
      this.generate();
    }
    return this.program;
  }

  bind() {
    if (!this.updated) {
      this.generate();
    }
    this.gl.useProgram(this.program);
  }

  getAttributeLocation(name) {
    return this.gl.getAttributeLocation(this.program, name);
  }
}

class GLShape {
  constructor() {

  }

  getVertices() {
    return [];
  }

  getIndices() {
    return [];
  }

  bind() {

  }

  draw() {

  }
}

class GLRectangle extends GLShape {
  constructor(gl, width, height, shader) {
    super()
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.shader = shader;

    // Define vertices with their respective texture coordinates
    const halfW = width * 0.5;
    const halfH = height * 0.5;

    this.vertices = new Float32Array([
      -halfW, -halfH, 0.0, 1.0, // Bottom-left
      halfW, -halfH, 1.0, 1.0,  // Bottom-right
      -halfW, halfH, 0.0, 0.0,  // Top-left
      halfW, halfH, 1.0, 0.0    // Top-right
    ]);

    this.indices = new Uint16Array([
      0, 1, 2, // First triangle
      2, 1, 3  // Second triangle
    ]);

    // Create and bind a vertex buffer
    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices, this.gl.STATIC_DRAW);

    // Create and bind an index buffer
    this.indexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.indices, this.gl.STATIC_DRAW);

    // For now just use attributes outlined in default shaders
    const aPosition = this.gl.getAttribLocation(this.shader.getProgram(), 'aPosition');
    const aTexCoord = this.gl.getAttribLocation(this.shader.getProgram(), 'aTexCoord');

    this.gl.vertexAttribPointer(aPosition, 2, this.gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 0);
    this.gl.enableVertexAttribArray(aPosition);

    this.gl.vertexAttribPointer(aTexCoord, 2, this.gl.FLOAT, false, 4 * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
    this.gl.enableVertexAttribArray(aTexCoord);
  }

  bind() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
  }

  draw() {
    this.gl.drawElements(this.gl.TRIANGLES, this.indices.length, this.gl.UNSIGNED_SHORT, 0);
  }
}

class GLCanvasRenderer {
  constructor(gl, width, height, maxFragmentUniformVectors) {
    this.gl = gl;
    this.width = width;
    this.height = height;

    this.linesRenderShader = new GLShader(gl, GLRenderShaderSourceGenerator.getMultipleRenderVertexShaderSrc(), GLRenderShaderSourceGenerator.getMultipleRenderFragmentShaderSrc(true, width, height, 1));
    this.linesRenderShader.generate();
    this.linesRenderMultipleShader = new GLShader(gl, GLRenderShaderSourceGenerator.getMultipleRenderVertexShaderSrc(), GLRenderShaderSourceGenerator.getMultipleRenderFragmentShaderSrc(true, width, height, maxFragmentUniformVectors));
    this.linesRenderMultipleShader.generate();

    this.circlesRenderShader = new GLShader(gl, GLRenderShaderSourceGenerator.getMultipleRenderVertexShaderSrc(), GLRenderShaderSourceGenerator.getMultipleRenderFragmentShaderSrc(false, width, height, 1));
    this.circlesRenderShader.generate();
    this.circlesRenderMultipleShader = new GLShader(gl, GLRenderShaderSourceGenerator.getMultipleRenderVertexShaderSrc(), GLRenderShaderSourceGenerator.getMultipleRenderFragmentShaderSrc(false, width, height, maxFragmentUniformVectors));
    this.circlesRenderMultipleShader.generate();

    this.drawShader = new GLShader(gl, GLDrawShaderSourceGenerator.getDrawVertexShaderSrc(), GLDrawShaderSourceGenerator.getDrawFragmentShaderSrc());
    this.drawShader.generate();

    this.linesRenderShape = new GLRectangle(gl, 2.0, 2.0, this.linesRenderShader);
    this.linesRenderMultipleShape = new GLRectangle(gl, 2.0, 2.0, this.linesRenderMultipleShader);
    this.circlesRenderShape = new GLRectangle(gl, 2.0, 2.0, this.circlesRenderShader);
    this.circlesRenderMultipleShape = new GLRectangle(gl, 2.0, 2.0, this.circlesRenderMultipleShader);
    
    this.drawShape = new GLRectangle(gl, 2.0, 2.0, this.drawShader);

    this.radiusSquared = 169;
    this.startingColor = new Float32Array([0.66666, 0.66666, 0.66666]);
    this.colorOverlapDecrement = new Float32Array([0.0705882353, 0.0705882353, 0.0705882353]);

    // Create interim texture
    this.interimTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.interimTexture);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,                        // Mipmap level
      this.gl.RGBA,             // Internal format
      this.width,               // Texture width
      this.height,              // Texture height
      0,                        // Border
      this.gl.RGBA,             // Format of data
      this.gl.UNSIGNED_BYTE,    // Type of data
      null                      // No data yet
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null); // Unbind


    // Create final texture
    this.finalTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.finalTexture);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,                        // Mipmap level
      this.gl.RGBA,             // Internal format
      this.width,               // Texture width
      this.height,              // Texture height
      0,                        // Border
      this.gl.RGBA,             // Format of data
      this.gl.UNSIGNED_BYTE,    // Type of data
      null                      // No data yet
    );

    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.gl.bindTexture(this.gl.TEXTURE_2D, null); // Unbind


    // Create interim framebuffer
    this.interimFramebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.interimFramebuffer);

    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,      // Attachment point
      this.gl.TEXTURE_2D,             // Target texture type
      this.interimTexture,            // Texture to attach
      0                               // Mipmap level
    );

    if (this.gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error("Framebuffer is not complete");
    }

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    // Create final framebuffer
    this.finalFramebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.finalFramebuffer);

    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,      // Attachment point
      this.gl.TEXTURE_2D,             // Target texture type
      this.finalTexture,              // Texture to attach
      0                               // Mipmap level
    );

    if (this.gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      console.error("Framebuffer is not complete");
    }

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    this.drawShader.uniformLocationCache.set("uTexture", this.gl.getUniformLocation(this.drawShader.getProgram(), "uTexture"))

    this.linesRenderShader.uniformLocationCache.set("uTexture", this.gl.getUniformLocation(this.linesRenderShader.getProgram(), "uTexture"));
    this.linesRenderShader.uniformLocationCache.set("uPosition", this.gl.getUniformLocation(this.linesRenderShader.getProgram(), "uPosition"));
    this.linesRenderShader.uniformLocationCache.set("uLastPosition", this.gl.getUniformLocation(this.linesRenderShader.getProgram(), "uLastPosition"));
    this.linesRenderShader.uniformLocationCache.set("uRadiusSquared", this.gl.getUniformLocation(this.linesRenderShader.getProgram(), "uRadiusSquared"));
    this.linesRenderShader.uniformLocationCache.set("uColorDecrement", this.gl.getUniformLocation(this.linesRenderShader.getProgram(), "uColorDecrement"));

    this.linesRenderMultipleShader.uniformLocationCache.set("uTexture", this.gl.getUniformLocation(this.linesRenderMultipleShader.getProgram(), "uTexture"));
    this.linesRenderMultipleShader.uniformLocationCache.set("uPosition", this.gl.getUniformLocation(this.linesRenderMultipleShader.getProgram(), "uPosition"));
    this.linesRenderMultipleShader.uniformLocationCache.set("uLastPosition", this.gl.getUniformLocation(this.linesRenderMultipleShader.getProgram(), "uLastPosition"));
    this.linesRenderMultipleShader.uniformLocationCache.set("uRadiusSquared", this.gl.getUniformLocation(this.linesRenderMultipleShader.getProgram(), "uRadiusSquared"));
    this.linesRenderMultipleShader.uniformLocationCache.set("uColorDecrement", this.gl.getUniformLocation(this.linesRenderMultipleShader.getProgram(), "uColorDecrement"));

    this.circlesRenderShader.uniformLocationCache.set("uTexture", this.gl.getUniformLocation(this.circlesRenderShader.getProgram(), "uTexture"));
    this.circlesRenderShader.uniformLocationCache.set("uPosition", this.gl.getUniformLocation(this.circlesRenderShader.getProgram(), "uPosition"));
    this.circlesRenderShader.uniformLocationCache.set("uRadiusSquared", this.gl.getUniformLocation(this.circlesRenderShader.getProgram(), "uRadiusSquared"));
    this.circlesRenderShader.uniformLocationCache.set("uColorDecrement", this.gl.getUniformLocation(this.circlesRenderShader.getProgram(), "uColorDecrement"));

    this.circlesRenderMultipleShader.uniformLocationCache.set("uTexture", this.gl.getUniformLocation(this.circlesRenderMultipleShader.getProgram(), "uTexture"));
    this.circlesRenderMultipleShader.uniformLocationCache.set("uPosition", this.gl.getUniformLocation(this.circlesRenderMultipleShader.getProgram(), "uPosition"));
    this.circlesRenderMultipleShader.uniformLocationCache.set("uRadiusSquared", this.gl.getUniformLocation(this.circlesRenderMultipleShader.getProgram(), "uRadiusSquared"));
    this.circlesRenderMultipleShader.uniformLocationCache.set("uColorDecrement", this.gl.getUniformLocation(this.circlesRenderMultipleShader.getProgram(), "uColorDecrement"));

    this.positionUniform = new Float32Array([0.0, 0.0]);
    this.lastPositionUniform = new Float32Array([-10000.0, -10000.0]);
  }

  setRadiusPixels(newWidth) {
    this.radiusSquared = newWidth * newWidth;
  }

  // newColor should be a Float32Array with 3 elements
  setStartingColor(newColor) {
    this.startingColor = newColor;
  }

  // newColor should be a Float32Array with 3 elements
  setOverlapDecrementColor(newColor) {
    this.colorOverlapDecrement = newColor;
  }

  resetLastPosition() {
    this.lastPositionUniform[0] = -10000.0;
    this.lastPositionUniform[1] = -10000.0;
  }

  clearTexture() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.finalFramebuffer);

    // Set the viewport to match the texture size
    this.gl.viewport(0, 0, this.width, this.height);

    // Clear the framebuffer
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  // If renderLines = true, then draws lines, otherwise, draws circles
  render(renderLines, positionX, positionY) {
    // First we draw to the interim framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.interimFramebuffer);

    this.gl.viewport(0, 0, this.width, this.height);

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    if (renderLines) {
      this.linesRenderShader.bind();
    } else {
      this.circlesRenderShader.bind();
    }

    if (this.lastPositionUniform[0] == -10000.0) {
      this.lastPositionUniform[0] = positionX;
      this.lastPositionUniform[1] = positionY;
    }
    this.positionUniform[0] = positionX;
    this.positionUniform[1] = positionY;
    if (renderLines) {
      this.gl.uniform2fv(this.linesRenderShader.uniformLocationCache.get("uPositions"), this.positionUniform);
      this.gl.uniform2fv(this.linesRenderShader.uniformLocationCache.get("uLastPosition"), this.lastPositionUniform);
      this.gl.uniform1f(this.linesRenderShader.uniformLocationCache.get("uRadiusSquared"), this.radiusSquared);
      this.gl.uniform3fv(this.linesRenderShader.uniformLocationCache.get("uStartingColor"), this.startingColor);
      this.gl.uniform3fv(this.linesRenderShader.uniformLocationCache.get("uColorDecrement"), this.colorOverlapDecrement);
    } else {
      this.gl.uniform2fv(this.circlesRenderShader.uniformLocationCache.get("uPositions"), this.positionUniform);
      this.gl.uniform1f(this.circlesRenderShader.uniformLocationCache.get("uRadiusSquared"), this.radiusSquared);
      this.gl.uniform3fv(this.circlesRenderShader.uniformLocationCache.get("uStartingColor"), this.startingColor);
      this.gl.uniform3fv(this.circlesRenderShader.uniformLocationCache.get("uColorDecrement"), this.colorOverlapDecrement);
    }
    this.lastPositionUniform[0] = this.positionUniform[0];
    this.lastPositionUniform[1] = this.positionUniform[1];

    this.gl.activeTexture(this.gl.TEXTURE0);
    // Pull data from the final texture (since we are drawing to the interim one) this final texture
    // data should be the entire render not including this current "frame".
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.finalTexture);
    if (renderLines) {
      this.gl.uniform1i(this.linesRenderShader.uniformLocationCache.get("uTexture"), 0);
    } else {
      this.gl.uniform1i(this.circlesRenderShader.uniformLocationCache.get("uTexture"), 0);
    }

    if (renderLines) {
      this.linesRenderShape.bind();
      this.linesRenderShape.draw()
    } else {
      this.circlesRenderShape.bind();
      this.circlesRenderShape.draw()
    }

    // Then we copy the interim framebuffer to the final framebuffer with a simple "draw" pass
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.finalFramebuffer);

    this.gl.viewport(0, 0, this.width, this.height);

    this.drawShader.bind();

    this.gl.activeTexture(this.gl.TEXTURE0);
    // Use the interim texture so we are drawing from our rendered output
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.interimTexture);
    this.gl.uniform1i(this.drawShader.uniformLocationCache.get("uTexture"), 0);

    this.drawShape.bind();
    this.drawShape.draw();
    // We should now have our rendered output in our final framebuffer, so we can pass the final framebuffer
    // back into the next draw call as a texture
  }

  // Expects one Float32Array of format [x1, y1, x2, y2, x3, y3, ..., xn, yn]
  renderMultiple(positions) {
    if (positions.length < 2 || positions.length % 2 != 0) {
      console.log("Invalid positions array passed into renderMultiple, must be at least two values, and an even size")
      return;
    }
    // First we draw to the interim framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.interimFramebuffer);

    this.gl.viewport(0, 0, this.width, this.height);

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.renderMultipleShader.bind();
    if (this.renderMultiplePositionUniformLocation == null) {
      this.renderMultiplePositionUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uPositions");
      this.renderMultipleLastPositionUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uLastPosition");
      this.renderMultipleTextureUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uTexture");

      this.renderMultipleLineWidthUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uRadiusSquared");
      this.renderMultipleStartingColorUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uStartingColor");
      this.renderMultipleColorDecrementUniformLocation = this.gl.getUniformLocation(this.renderMultipleShader.getProgram(), "uColorDecrement");
    }
    if (this.lastPositionUniform[0] == -10000.0) {
      this.lastPositionUniform[0] = positions[0];
      this.lastPositionUniform[1] = positions[1];
    }
    this.gl.uniform2fv(this.renderMultiplePositionUniformLocation, positions);
    this.gl.uniform2fv(this.renderMultipleLastPositionUniformLocation, this.lastPositionUniform);
    this.lastPositionUniform[0] = positions[positions.length - 2];
    this.lastPositionUniform[1] = positions[positions.length - 1];

    this.gl.uniform1f(this.renderMultipleLineWidthUniformLocation, this.lineWidthSquared);
    this.gl.uniform3fv(this.renderMultipleStartingColorUniformLocation, this.lineStartingColor);
    this.gl.uniform3fv(this.renderMultipleColorDecrementUniformLocation, this.lineColorOverlapDecrement);

    this.gl.activeTexture(this.gl.TEXTURE0);
    // Pull data from the final texture (since we are drawing to the interim one) this final texture
    // data should be the entire render not including this current "frame".
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.finalTexture);
    this.gl.uniform1i(this.renderMultipleTextureUniformLocation, 0);

    this.renderMultipleShape.bind();
    this.renderMultipleShape.draw()

    // Then we copy the interim framebuffer to the final framebuffer with a simple "draw" pass
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.finalFramebuffer);

    this.gl.viewport(0, 0, this.width, this.height);

    this.drawShader.bind();

    this.gl.activeTexture(this.gl.TEXTURE0);
    // Use the interim texture so we are drawing from our rendered output
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.interimTexture);
    this.gl.uniform1i(this.drawShader.uniformLocationCache.get("uTexture"), 0);

    this.drawShape.bind();
    this.drawShape.draw();
    // We should now have our rendered output in our final framebuffer, so we can pass the final framebuffer
    // back into the next draw call as a texture
  }

  draw(width, height) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    this.gl.viewport(0, 0, width, height);
    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);

    this.drawShader.bind();

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.finalTexture);
    this.gl.uniform1i(this.drawShader.uniformLocationCache.get("uTexture"), 0);

    this.drawShape.bind();
    this.drawShape.draw();
  }
}

class CanvasManager {
  constructor(canvas) {
    this.profiler = new Profiler();
    this.canvas = canvas;
    this.drawModeEnabled = false;
    this.mouseDown = false;
    this.setupSuccess = this.initialize();
  }

  initialize() {
    // Initialize the GL context
    this.gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false  // Ask for non-premultiplied alpha
    });
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.maxFragmentUniformVectors = this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    console.log("Max fragment uniform vectors: " + this.maxFragmentUniformVectors);

    if (this.gl === null) {
      alert(
        "Unable to initialize WebGL. Your browser or machine may not support it, falling back to old rendering technique.",
      );
      return false;
    }

    this.canvas.addEventListener('mousedown', (event) => {
      this.mouseDown = true;
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      this.renderer.render(x, y);
      this.renderer.draw(this.canvas.width, this.canvas.height);
    });

    this.canvas.addEventListener('mouseup', (event) => {
      if (this.mouseDown) {
        this.mouseDown = false;
        const rect = this.canvas.getBoundingClientRect();
        //const x = event.clientX;
        //const y = event.clientY;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.renderer.render(x, y);
        this.renderer.draw(this.canvas.width, this.canvas.height);
      }
      this.renderer.resetLastPosition();
    });

    this.canvas.addEventListener('mousemove', (event) => {
      if (this.mouseDown) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) {
          this.mouseDown = false;
          this.renderer.resetLastPosition();
          return;
        }
        this.renderer.render(x, y);
        this.renderer.draw(this.canvas.width, this.canvas.height);
      }
    });

    this.renderer = new GLCanvasRenderer(this.gl, this.canvas.width, this.canvas.height, this.maxFragmentUniformVectors);

    this.gl.clearColor(0.0, 0.0, 0.0, 0.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.renderer.draw(canvas.width, canvas.height);
    this.profiler.printStatsSinceLast("Initialization Time");

    return true;
  }

  clear() {
    this.renderer.clearTexture();
    this.renderer.draw(canvas.width, canvas.height);
  }
}

const canvas = document.querySelector("#gl-canvas");
const cm = new CanvasManager(canvas);
//shadedTexture.setLineOverlapDecrementColor(new Float32Array([0.001, 0.001, 0.001]))
cm.renderer.setRadiusPixels(2.0);
//shadedTexture.setLineStartingColor(new Float32Array([1.0, 1.0, 1.0]))

// Get slider and display element
const rSlider = document.getElementById('rSlider');
const rSliderValue = document.getElementById('rSliderValue');

// Update the value display when the slider changes
rSlider.addEventListener('input', () => {
  rSliderValue.textContent = rSlider.value;
  cm.renderer.lineStartingColor[0] = rSlider.value;
});

// Get slider and display element
const rDecSlider = document.getElementById('rDecSlider');
const rDecSliderValue = document.getElementById('rDecSliderValue');

// Update the value display when the slider changes
rDecSlider.addEventListener('input', () => {
  rDecSliderValue.textContent = rDecSlider.value;
  cm.renderer.lineColorOverlapDecrement[0] = rDecSlider.value;
});



// Get slider and display element
const gSlider = document.getElementById('gSlider');
const gSliderValue = document.getElementById('gSliderValue');

// Update the value display when the slider changes
gSlider.addEventListener('input', () => {
  gSliderValue.textContent = gSlider.value;
  cm.renderer.lineStartingColor[1] = gSlider.value;
});

// Get slider and display element
const gDecSlider = document.getElementById('gDecSlider');
const gDecSliderValue = document.getElementById('gDecSliderValue');

// Update the value display when the slider changes
gDecSlider.addEventListener('input', () => {
  gDecSliderValue.textContent = gDecSlider.value;
  cm.renderer.lineColorOverlapDecrement[1] = gDecSlider.value;
});



// Get slider and display element
const bSlider = document.getElementById('bSlider');
const bSliderValue = document.getElementById('bSliderValue');

// Update the value display when the slider changes
bSlider.addEventListener('input', () => {
  bSliderValue.textContent = bSlider.value;
  cm.renderer.lineStartingColor[2] = bSlider.value;
});

// Get slider and display element
const bDecSlider = document.getElementById('bDecSlider');
const bDecSliderValue = document.getElementById('bDecSliderValue');

// Update the value display when the slider changes
bDecSlider.addEventListener('input', () => {
  bDecSliderValue.textContent = bDecSlider.value;
  cm.renderer.lineColorOverlapDecrement[2] = bDecSlider.value;
});

const lineWidthInput = document.getElementById('lineWidthInput');

// Display the value when changed
lineWidthInput.addEventListener('input', () => {
  cm.renderer.setRadiusPixels(lineWidthInput.value);
});

function generate() {
  Profiler.profileFunction("Total Generation Time", () => {
    const p = new Profiler();
  
    var temp = new Float32Array(512);
    for (var j = 0; j < 256; ++j) {
      for (var i = 0; i < 512; ++i) {
        if (i % 2 == 0) {
          temp[i] = Math.floor(Math.random() * 640.0);
        } else {
          temp[i] = Math.floor(Math.random() * 480.0);
        }
      }
      cm.renderer.renderMultiple(temp);
    }
    p.printStatsSinceLast("Render time");
    cm.renderer.draw(canvas.width, canvas.height);
    p.printStatsSinceLast("Draw time");
    cm.renderer.resetLastPosition();
  });
}

function clear() {
  cm.clear();
}

window.generateRandom = generate;
window.clearCanvas = clear;