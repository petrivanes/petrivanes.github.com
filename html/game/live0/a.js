/* ---------------------- Setup --------------------- 
* нужна вспомогательная библиотека - webgl-2d.js
* разобраться как сделать без нее
*/
let canvas = document.getElementById("canvasGL");
let info = document.getElementById("info");
WebGL2D.enable(canvas); // adds new context "webgl-2d" to canvas

let gl = canvas.getContext('webgl2');
if (!gl) console.error('no webgl2');

let board_height = 5000;// 500
let board_width  = 5000;// 500 

let center = [0,0];       // view center
let center_vel = [0,0];   // view center change per iteration (+=) 
let span = .02;           // view size 
let span_mul = 1;         // view size change per iter (*=)

let count = 0;            // Counter for setting iteration speed
let speed = 2;            // Speed (0:stop,1:slow,2:medium,3:full speed)
let READ  = 0;            // Which index to read from (0 or 1)

let frames = 0;           // Count total rendered frames
let iterations = 0;       // Count total board updates

Buffer(new Float32Array([-1,-1, 1,-1, -1,1, 1,1]));

/* --------------- Textures and Framebuffers ----------------------- */

let data = new Uint8Array(board_width*board_height);
for (let i = 0; i < data.length; i++) {
    if (Math.random() < 1/2) data[i] = 1;
}

let textures     = [gl.createTexture(),     gl.createTexture()];
let framebuffers = [gl.createFramebuffer(), gl.createFramebuffer()];

for (let i of [0,1]) {
    
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(  gl.TEXTURE_2D, textures[i]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, board_width, board_height, 
        0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, data);

    gl.bindFramebuffer(      gl.FRAMEBUFFER, framebuffers[i]);
    gl.framebufferTexture2D( gl.FRAMEBUFFER, 
        gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textures[i], 0);
}
/* --------------- Display Program --------------- */

let display = ProgramBundle( 
`
in vec2 vertices;
out vec2 uv;

uniform vec2 center;
uniform float span, aspect;

void main()
{
    uv = .5 + .5*(center + span*vec2(aspect,1.)*vertices);
    gl_Position = vec4(vertices, 0., 1.);
}`, 
`
precision highp float;
precision highp usampler2D;

in vec2 uv;
out vec4 color;
uniform usampler2D board;

void main() 
{
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        color = vec4( .1, .1, .1, 1.);
    }
    else {
        float i = 1.0 - float(texture(board, uv).x);
        color = vec4(i, i, i, 1);
    }
}`);

display.run = (tex_in_unit, center=[0,0], span=0) => {

    gl.useProgram(display.program);
    gl.vertexAttribPointer( display.vertices, 2,gl.FLOAT, false, 0,0);

    gl.uniform2fv(display.center, center);
    gl.uniform1f( display.span,   span);
    gl.uniform1i( display.board,  tex_in_unit);
   
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0,0,canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function SetAspect(){  

    let w = window.innerWidth;
    let h = window.innerHeight;

    canvas.width  = w;
    canvas.height = h;

    gl.uniform1f(display.aspect, w/h);
}
SetAspect();
window.addEventListener( 'resize', SetAspect);

/* ------------- Update Program ---------------- */

let update = ProgramBundle(
`
in vec2 vertices;
void main(){
    gl_Position = vec4(vertices, 0., 1.);
}`,

`
precision highp usampler2D;

uniform usampler2D board;
out uint this_cell_alive;   

int cell(int x, int y) {  
    return int(texelFetch(board, ivec2(x,y), 0).x);
}
void main() 
{
    int x, y, xLeft,xRight, yUp, yDown, live, neighbors;

    x = int(gl_FragCoord.x);
    y = int(gl_FragCoord.y);

    xLeft  = x - 1;
    xRight = x + 1;
    yUp    = y + 1;
    yDown  = y - 1;

    if (xLeft < 0) xLeft = ${board_width-1};
    if (xRight > ${board_width-1}) xRight = 0;
    if (yDown < 0) yDown = ${board_height-1};
    if (yUp > ${board_height-1}) yUp = 0;
    
    live = cell(x,y);
    
    neighbors =
        cell(xLeft,yUp)  + cell(x,yUp)  + cell(xRight, yUp) +
        cell(xLeft,y)    + 0            + cell(xRight, y)   +
        cell(xLeft,yDown)+ cell(x,yDown)+ cell(xRight, yDown);

    if (live == 1) {
        if (neighbors < 2) live = 0;
        if (neighbors > 3) live = 0;
    }
    else {
        if (neighbors == 3) live = 1;
    }
    this_cell_alive = uint(live);
}`);

update.run = (tex_in_unit, tex_out_fbo) => {

    gl.useProgram( update.program);
    gl.vertexAttribPointer(update.vertices, 2,gl.FLOAT, false, 0,0);
    gl.uniform1i( update.board, tex_in_unit);
   
    gl.bindFramebuffer(gl.FRAMEBUFFER, tex_out_fbo);
    gl.viewport(0,0, board_width, board_height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* ---------------- Keyboard --------------- */

document.onkeydown = (e) => {    
    e.preventDefault();
    
    if (e.key == 'Enter')      span_mul      =  .98;
    if (e.key == 'Shift')      span_mul      = 1.02;
    if (e.key == 'ArrowLeft')  center_vel[0] = -.03*span;
    if (e.key == 'ArrowRight') center_vel[0] =  .03*span;
    if (e.key == 'ArrowUp')    center_vel[1] =  .03*span;
    if (e.key == 'ArrowDown')  center_vel[1] = -.03*span;

    if (e.key == '0') speed = 0; 
    if (e.key == '1') speed = 1;
    if (e.key == '2') speed = 2;
    if (e.key == '3') speed = 3;
}

document.onkeyup = () => {
    center_vel = [0,0];
    span_mul   = 1;
}

/* ------------------------- Main Loop ---------------------- */

(function loop() {

    let needs_update = false;

    if (speed == 0) next_turn = false;
    if (speed == 1) {
        if (++count > 20) {
            needs_update = true;
            count = 0;
        }
    }
    if (speed == 2) { 
        if (++count > 5) {
            needs_update = true;
            count = 0;
        }
    }
    if (speed == 3) needs_update = true;

    if (needs_update) {
        iterations++;
        update.run( READ, framebuffers[1-READ]);
        READ = 1 - READ;
    }

    if (++frames < 50) span *= 1.03;

    center[0] += center_vel[0];
    center[1] += center_vel[1];
    span      *= span_mul;

    display.run(READ, center, span);
   
    info.innerHTML = 
    `size: ${board_width}x${board_height}<br>
    frames: ${frames}<br>
    iterations: ${iterations}
    `;
    requestAnimationFrame(loop);
})()

/* ----------------------------------------------------------------- */

function Buffer(data) {

    let buf = gl.createBuffer();
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    return buf;
}

function ProgramBundle(vertex_code, fragment_code) {

    let prog = { program:gl.createProgram()};
    let vertex_shader   = gl.createShader(gl.VERTEX_SHADER);    
    let fragment_shader = gl.createShader(gl.FRAGMENT_SHADER);

    vertex_code   = "#version 300 es\n" + vertex_code;
    fragment_code = "#version 300 es\n" + fragment_code;

    gl.shaderSource( fragment_shader, fragment_code);
    gl.shaderSource( vertex_shader,   vertex_code);
    gl.compileShader(vertex_shader);     
    gl.compileShader(fragment_shader);  

    gl.attachShader( prog.program, vertex_shader);
    gl.attachShader( prog.program, fragment_shader);
    gl.linkProgram(  prog.program); 
    gl.useProgram(   prog.program);  

    let attrib_count = gl.getProgramParameter(prog.program, gl.ACTIVE_ATTRIBUTES); 
    for (let i= 0; i < attrib_count; i++) {
        let attrib_name     = gl.getActiveAttrib(  prog.program, i).name;   
        let attrib_location = gl.getAttribLocation(prog.program, attrib_name);
        gl.enableVertexAttribArray(attrib_location);
        prog[attrib_name] = attrib_location;  
    }

    let uniform_count = gl.getProgramParameter( prog.program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniform_count; i++) {  
        let uniform_name     = gl.getActiveUniform(  prog.program, i).name;
        let uniform_location = gl.getUniformLocation(prog.program, uniform_name);
        prog[uniform_name] = uniform_location;
    }

    console.log(gl.getShaderInfoLog(vertex_shader));
    console.log(gl.getShaderInfoLog(fragment_shader));
    console.log(gl.getProgramInfoLog(prog.program));
    for (let i in prog) console.log(i, prog[i]);

    return prog;
}
