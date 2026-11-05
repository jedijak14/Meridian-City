import * as THREE from 'three';

export class Particles {
  points: THREE.Points;
  max: number;
  idx = 0;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grav: Float32Array;
  grow: Float32Array;
  drag: Float32Array;
  s0: Float32Array;
  a0: Float32Array;
  mat: THREE.ShaderMaterial;
  geo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.grav = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
      void main(){ vA=aAlpha; vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
      void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c)*2.0; float a=smoothstep(1.0,0.0,d)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
  }

  emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    size: number, grow: number,
    r: number, g: number, b: number,
    life: number, alpha = 1, gravity = 0, drag = 0.5
  ) {
    const i = this.idx;
    this.idx = (this.idx + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.s0[i] = size; this.size[i] = size; this.grow[i] = grow;
    this.life[i] = life; this.maxLife[i] = life;
    this.a0[i] = alpha; this.alpha[i] = alpha;
    this.grav[i] = gravity; this.drag[i] = drag;
  }

  update(dt: number, scale: number) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.pos[i * 3 + 1] = -1000;
        }
        continue;
      }
      this.life[i] -= dt;
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.05 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] *= -0.3;
        this.vel[i3] *= 0.6;
        this.vel[i3 + 2] *= 0.6;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + this.grow[i] * t;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.2);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(scene: THREE.Scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}
