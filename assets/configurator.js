/**
 * Prinjekt Configurator - Shopify Asset
 * Main initialization script for the 3D product configurator
 * 
 * This script handles:
 * - API communication with OpenSCAD backend
 * - 3D model loading and rendering with Three.js
 * - Parameter controls and form handling
 * - Price calculations
 * - Add to cart functionality
 */

// Import Three.js and addons (using importmap)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

/**
 * Main configuration object
 */
class PrinjektConfigurator {
  constructor(config) {
    this.config = config;
    this.sectionId = config.sectionId;
    this.apiBase = config.apiBase;
    this.productGid = config.productGid;
    this.currencyFormat = config.currencyFormat;
    
    // 3D Model settings
    this.modelColor = config.modelColor || '#F59F27';
    this.modelMetalness = config.modelMetalness || 0.3;
    this.modelRoughness = config.modelRoughness || 0.7;
    this.sceneColor = config.sceneColor || '#ffffff';
    
    // State
    this.parameters = {};
    this.currentPrice = null;
    this.currentSTL = null;
    this.isDirty = false;
    
    // Three.js objects
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.model = null;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the configurator
   */
  async init() {
    try {
      // Get DOM elements
      this.elements = {
        canvas: document.getElementById(`prinjekt-canvas-${this.sectionId}`),
        overlay: document.getElementById(`prinjekt-overlay-${this.sectionId}`),
        status: document.getElementById(`prinjekt-status-${this.sectionId}`),
        updateOverlay: document.getElementById(`prinjekt-update-overlay-${this.sectionId}`),
        priceDisplay: document.getElementById(`prinjekt-price-${this.sectionId}`),
        paramsContainer: document.getElementById(`prinjekt-params-${this.sectionId}`),
        form: document.getElementById(`prinjekt-form-${this.sectionId}`),
        updateBtn: document.getElementById(`update-btn-${this.sectionId}`),
        cartBtn: document.getElementById(`cart-btn-${this.sectionId}`),
        zoomBtn: document.getElementById(`zoom-fit-${this.sectionId}`),
        updateNowBtn: document.getElementById(`prinjekt-update-now-${this.sectionId}`),
        dismissBtn: document.getElementById(`prinjekt-dismiss-${this.sectionId}`)
      };
      
      // Setup Three.js viewer
      this.setupViewer();
      
      // Load parameters from API
      await this.loadParameters();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Hide loading overlay
      this.hideOverlay();
      
    } catch (error) {
      console.error('Failed to initialize configurator:', error);
      this.showError('Failed to initialize configurator');
    }
  }
  
  /**
   * Setup Three.js 3D viewer
   */
  setupViewer() {
    const canvas = this.elements.canvas;
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.sceneColor);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 150);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(5, 10, 7.5);
    this.scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, -10, -7.5);
    this.scene.add(directionalLight2);
    
    // Grid helper (configurable)
    if (this.config.showGrid !== false) {
      const gridSize = this.config.gridSize || 200;
      const gridDivisions = this.config.gridDivisions || 20;
      const gridColorCenter = new THREE.Color(this.config.gridColorCenter || 0x888888);
      const gridColorGrid = new THREE.Color(this.config.gridColorGrid || 0xcccccc);
      
      this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, gridColorCenter, gridColorGrid);
      this.gridHelper.material.opacity = this.config.gridOpacity || 0.3;
      this.gridHelper.material.transparent = true;
      this.scene.add(this.gridHelper);
    }
    
    // Axes helper (configurable)
    if (this.config.showAxes !== false) {
      const axesSize = this.config.axesSize || 75;
      this.axesHelper = new THREE.AxesHelper(axesSize);
      this.axesHelper.material.linewidth = 2;
      this.scene.add(this.axesHelper);
      
      // Add XYZ labels
      if (this.config.showAxesLabels !== false) {
        this.addAxisLabels(axesSize);
      }
    }
    
    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 500;
    
    // Start animation loop
    this.animate();
    
    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  /**
   * Add XYZ axis labels
   */
  addAxisLabels(size) {
    const loader = new THREE.FontLoader();
    
    // Create simple text sprites instead of 3D text for better performance
    const createTextSprite = (text, color, position) => {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 64;
      canvas.height = 64;
      
      context.fillStyle = color;
      context.font = 'Bold 48px Arial';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 32, 32);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(10, 10, 1);
      sprite.position.copy(position);
      
      return sprite;
    };
    
    // X axis label (Red)
    const xLabel = createTextSprite('X', '#ff0000', new THREE.Vector3(size + 10, 0, 0));
    this.scene.add(xLabel);
    
    // Y axis label (Green)
    const yLabel = createTextSprite('Y', '#00ff00', new THREE.Vector3(0, size + 10, 0));
    this.scene.add(yLabel);
    
    // Z axis label (Blue)
    const zLabel = createTextSprite('Z', '#0000ff', new THREE.Vector3(0, 0, size + 10));
    this.scene.add(zLabel);
    
    // Store labels for potential later removal
    this.axisLabels = [xLabel, yLabel, zLabel];
  }
  
  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  
  /**
   * Handle window resize
   */
  onWindowResize() {
    const canvas = this.elements.canvas;
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  }
  
  /**
   * Load parameters from API
   */
  async loadParameters() {
    try {
      this.showStatus('Loading parameters...');
      
      const response = await fetch(`${this.apiBase}/${encodeURIComponent(this.productGid)}`);
      
      if (!response.ok) {
        throw new Error('Failed to load parameters');
      }
      
      const data = await response.json();
      this.parameters = data.parameters || {};
      
      // Render parameter controls
      this.renderParameters();
      
      // Auto-update preview on load
      await this.updatePreview();
      
    } catch (error) {
      console.error('Failed to load parameters:', error);
      this.showError('Failed to load parameters');
    }
  }
  
  /**
   * Render parameter controls
   */
  renderParameters() {
    const container = this.elements.paramsContainer;
    container.innerHTML = '';
    
    Object.entries(this.parameters).forEach(([key, param]) => {
      const paramDiv = document.createElement('div');
      paramDiv.className = 'prinjekt-param';
      
      // Label
      const label = document.createElement('label');
      label.textContent = param.label || key;
      label.setAttribute('for', `param-${this.sectionId}-${key}`);
      paramDiv.appendChild(label);
      
      // Description
      if (param.description) {
        const desc = document.createElement('div');
        desc.className = 'prinjekt-param-desc';
        desc.textContent = param.description;
        paramDiv.appendChild(desc);
      }
      
      // Input based on type
      const input = this.createInput(key, param);
      paramDiv.appendChild(input);
      
      container.appendChild(paramDiv);
    });
  }
  
  /**
   * Create input element based on parameter type
   */
  createInput(key, param) {
    const inputId = `param-${this.sectionId}-${key}`;
    
    switch (param.type) {
      case 'range':
        const container = document.createElement('div');
        
        const input = document.createElement('input');
        input.type = 'range';
        input.id = inputId;
        input.name = key;
        input.min = param.min || 0;
        input.max = param.max || 100;
        input.step = param.step || 1;
        input.value = param.default !== undefined ? param.default : param.min || 0;
        
        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'prinjekt-range-value';
        valueDisplay.textContent = input.value;
        
        input.addEventListener('input', (e) => {
          valueDisplay.textContent = e.target.value;
          this.markDirty();
        });
        
        container.appendChild(input);
        container.appendChild(valueDisplay);
        return container;
        
      case 'number':
        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.id = inputId;
        numberInput.name = key;
        numberInput.min = param.min;
        numberInput.max = param.max;
        numberInput.step = param.step || 1;
        numberInput.value = param.default !== undefined ? param.default : '';
        numberInput.addEventListener('input', () => this.markDirty());
        return numberInput;
        
      case 'text':
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.id = inputId;
        textInput.name = key;
        textInput.value = param.default || '';
        textInput.addEventListener('input', () => this.markDirty());
        return textInput;
        
      case 'select':
        const select = document.createElement('select');
        select.id = inputId;
        select.name = key;
        
        (param.options || []).forEach(option => {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          if (option === param.default) opt.selected = true;
          select.appendChild(opt);
        });
        
        select.addEventListener('change', () => this.markDirty());
        return select;
        
      case 'checkbox':
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = inputId;
        checkbox.name = key;
        checkbox.checked = param.default || false;
        checkbox.addEventListener('change', () => this.markDirty());
        return checkbox;
        
      default:
        const defaultInput = document.createElement('input');
        defaultInput.type = 'text';
        defaultInput.id = inputId;
        defaultInput.name = key;
        defaultInput.value = param.default || '';
        defaultInput.addEventListener('input', () => this.markDirty());
        return defaultInput;
    }
  }
  
  /**
   * Mark parameters as changed
   */
  markDirty() {
    this.isDirty = true;
    this.elements.updateOverlay.classList.remove('hidden');
    this.elements.cartBtn.classList.add('prinjekt-btn-disabled');
  }
  
  /**
   * Get current parameter values
   */
  getParameterValues() {
    const values = {};
    const inputs = this.elements.paramsContainer.querySelectorAll('input, select');
    
    inputs.forEach(input => {
      if (input.type === 'checkbox') {
        values[input.name] = input.checked;
      } else if (input.type === 'number' || input.type === 'range') {
        values[input.name] = parseFloat(input.value);
      } else {
        values[input.name] = input.value;
      }
    });
    
    return values;
  }
  
  /**
   * Update 3D preview and price
   */
  async updatePreview() {
    try {
      this.showOverlay('Generating 3D model...');
      
      const params = this.getParameterValues();
      
      const response = await fetch(
        `${this.apiBase}/${encodeURIComponent(this.productGid)}/preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ parameters: params })
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to generate preview');
      }
      
      const data = await response.json();
      
      // Update price
      this.currentPrice = data.price;
      this.updatePriceDisplay(data.price);
      
      // Load STL model
      if (data.stl_url) {
        this.currentSTL = data.stl_url;
        await this.loadSTLModel(data.stl_url);
      }
      
      // Clear dirty state
      this.isDirty = false;
      this.elements.updateOverlay.classList.add('hidden');
      this.elements.cartBtn.classList.remove('prinjekt-btn-disabled');
      this.elements.cartBtn.disabled = false;
      
      this.hideOverlay();
      
    } catch (error) {
      console.error('Failed to update preview:', error);
      this.showError('Failed to generate preview');
      this.hideOverlay();
    }
  }
  
  /**
   * Load STL model
   */
  async loadSTLModel(url) {
    return new Promise((resolve, reject) => {
      // Remove existing model
      if (this.model) {
        this.scene.remove(this.model);
        this.model.geometry.dispose();
        this.model.material.dispose();
      }
      
      const loader = new STLLoader();
      
      loader.load(
        url,
        (geometry) => {
          // Create material
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.modelColor),
            metalness: this.modelMetalness,
            roughness: this.modelRoughness,
            flatShading: false
          });
          
          // Create mesh
          this.model = new THREE.Mesh(geometry, material);
          
          // Center and scale model
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const center = box.getCenter(new THREE.Vector3());
          
          geometry.translate(-center.x, -center.y, -center.z);
          
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 100 / maxDim;
          this.model.scale.setScalar(scale);
          
          // Add to scene
          this.scene.add(this.model);
          
          // Fit camera
          this.fitCameraToModel();
          
          resolve();
        },
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          this.showStatus(`Loading model: ${percent.toFixed(0)}%`);
        },
        (error) => {
          console.error('STL loading error:', error);
          reject(error);
        }
      );
    });
  }
  
  /**
   * Fit camera to model
   */
  fitCameraToModel() {
    if (!this.model) return;
    
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Add some padding
    
    this.camera.position.set(center.x, center.y, center.z + cameraZ);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();
  }
  
  /**
   * Update price display
   */
  updatePriceDisplay(price) {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currencyFormat || 'USD'
    });
    
    this.elements.priceDisplay.textContent = formatter.format(price);
  }
  
  /**
   * Add to cart
   */
  async addToCart() {
    if (this.isDirty) {
      alert('Please update the preview before adding to cart');
      return;
    }
    
    if (!this.currentPrice) {
      alert('Please generate a model first to get accurate pricing');
      return;
    }
    
    try {
      const cartBtn = this.elements.cartBtn;
      
      // Disable button and show loading state
      cartBtn.disabled = true;
      const originalHTML = cartBtn.innerHTML;
      cartBtn.innerHTML = '<span class="prinjekt-spinner-inline"></span><span>Adding...</span>';
      
      // Collect parameter values as custom properties
      const params = this.getParameterValues();
      const paramProperties = {};
      
      Object.entries(params).forEach(([key, value]) => {
        paramProperties[`_config_${key}`] = String(value);
      });
      
      // Add metadata
      paramProperties['_config_price'] = String(this.currentPrice);
      paramProperties['_config_stl'] = this.currentSTL || '';
      paramProperties['_config_timestamp'] = new Date().toISOString();
      
      // Get variant ID from form
      const formData = new FormData(this.elements.form);
      const variantId = formData.get('id');
      
      if (!variantId) {
        throw new Error('Variant ID not found');
      }
      
      // Use Shopify's AJAX Cart API with JSON
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          id: variantId,
          quantity: 1,
          properties: paramProperties
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Failed to add to cart: ${response.status} - ${errorText}`);
      }
      
      const cartData = await response.json();
      console.log('✅ Added to cart:', cartData);
      
      // Show success state
      cartBtn.innerHTML = '✓ Added to Cart';
      cartBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      
      // Reset after 2 seconds
      setTimeout(() => {
        cartBtn.innerHTML = originalHTML;
        cartBtn.style.background = '';
        cartBtn.disabled = false;
        
        // Optional: Redirect to cart
        if (confirm('Product added to cart! Go to cart now?')) {
          window.location.href = '/cart';
        }
      }, 2000);
      
    } catch (error) {
      console.error('❌ Add to cart failed:', error);
      alert('Failed to add to cart: ' + error.message);
      
      // Reset button
      const cartBtn = this.elements.cartBtn;
      cartBtn.innerHTML = originalHTML || 'Add to Cart';
      cartBtn.disabled = false;
    }
  }
  
  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Update button
    this.elements.updateBtn?.addEventListener('click', () => {
      this.updatePreview();
    });
    
    // Add to cart button
    this.elements.cartBtn?.addEventListener('click', () => {
      this.addToCart();
    });
    
    // Zoom to fit button
    this.elements.zoomBtn?.addEventListener('click', () => {
      this.fitCameraToModel();
    });
    
    // Update overlay buttons
    this.elements.updateNowBtn?.addEventListener('click', () => {
      this.updatePreview();
    });
    
    this.elements.dismissBtn?.addEventListener('click', () => {
      this.elements.updateOverlay.classList.add('hidden');
    });
  }
  
  /**
   * Show loading overlay
   */
  showOverlay(message) {
    this.elements.overlay.classList.remove('hidden');
    if (message) {
      this.elements.status.textContent = message;
    }
  }
  
  /**
   * Hide loading overlay
   */
  hideOverlay() {
    this.elements.overlay.classList.add('hidden');
  }
  
  /**
   * Show status message
   */
  showStatus(message) {
    this.elements.status.textContent = message;
  }
  
  /**
   * Show error message
   */
  showError(message) {
    this.elements.status.textContent = `Error: ${message}`;
    setTimeout(() => this.hideOverlay(), 3000);
  }
}

/**
 * Initialize configurator instance
 * This function is called from the Liquid template
 */
export function initializePrinjektConfigurator(config) {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new PrinjektConfigurator(config);
    });
  } else {
    new PrinjektConfigurator(config);
  }
}

// Make it available globally for Liquid template
window.initializePrinjektConfigurator = initializePrinjektConfigurator;
