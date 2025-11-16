/**
 * ============================================================================
 * PRINJEKT CONFIGURATOR - MASTER LOGIC (V31 - Bounding Box Camera Fix)
 * ============================================================================
 * Headless JavaScript Library for 3D Product Configuration
 * This file contains ONLY the core logic:
 * - Three.js 3D rendering
 * - API communication with backend
 * - State management
 * - Model loading (DRACO compression)
 * - Parameter handling
 * - Cart operations
 * NO UI COMPONENTS - Pure logic only
 * Usage:
 * const configurator = new PrinjektConfigurator({
 * apiBase: 'https://prinjekt.duckdns.org/shopify-app/prototype/models',
 * productGid: 'gid://shopify/Product/123456',
 * canvas: document.getElementById('my-canvas'),
 * onStateChange: (state) => { console.log(state); }
 * });
 * Version: 3.1.0 - Master Logic Edition
 * ============================================================================
 */

(function(window) {
  'use strict';

  // ========== THREE.JS LIBRARY LOADER ==========
  /**
   * Dynamically loads Three.js libraries from CDN
   * Required because Shopify CDN doesn't host specialized 3D libraries
   * DRACO decoder requires specific versioned files from Google's CDN
   */
  async function loadThreeJSLibraries() {
    if (window.THREE && window.THREE.OrbitControls && window.THREE.DRACOLoader) {
      console.log('[Prinjekt Master] ✓ Three.js libraries already loaded');
      return true;
    }
    
    return new Promise((resolve, reject) => {
      console.log('[Prinjekt Master] Loading Three.js libraries...');
      
      const threeScript = document.createElement('script');
      threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      threeScript.async = true;
      threeScript.onload = () => {
        console.log('[Prinjekt Master] ✓ THREE.js loaded');
        
        const orbitScript = document.createElement('script');
        orbitScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
        orbitScript.async = true;
        orbitScript.onload = () => {
          console.log('[Prinjekt Master] ✓ OrbitControls loaded');
          
          const dracoScript = document.createElement('script');
          dracoScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js';
          dracoScript.async = true;
          dracoScript.onload = () => {
            console.log('[Prinjekt Master] ✓ DRACOLoader loaded');
            console.log('[Prinjekt Master] ✓ All libraries ready');
            resolve(true);
          };
          dracoScript.onerror = () => reject(new Error('Failed to load DRACOLoader'));
          document.head.appendChild(dracoScript);
        };
        orbitScript.onerror = () => reject(new Error('Failed to load OrbitControls'));
        document.head.appendChild(orbitScript);
      };
      threeScript.onerror = () => reject(new Error('Failed to load THREE.js'));
      document.head.appendChild(threeScript);
    });
  }

  // ========== MAIN CONFIGURATOR CLASS ==========
  class PrinjektConfigurator {
    /**
     * Initialize configurator with required options
     * @param {Object} options - Configuration options
     * @param {string} options.apiBase - Base URL for backend API
     * @param {string} options.productGid - Shopify product GID
     * @param {HTMLCanvasElement} options.canvas - Canvas element for 3D rendering
     * @param {string} [options.currencyCode='EUR'] - Currency code
     * @param {Function} [options.onStateChange] - Callback for state changes
     * @param {Function} [options.onError] - Callback for errors
     * @param {Object} [options.viewerSettings] - Initial viewer settings
     */
    constructor(options) {
      // Validate required options
      if (!options.apiBase) throw new Error('apiBase is required');
      if (!options.productGid) throw new Error('productGid is required');
      if (!options.canvas) throw new Error('canvas element is required');
      
      // Configuration
      this.apiBase = options.apiBase;
      this.productGid = options.productGid;
      this.canvas = options.canvas;
      this.currencyCode = options.currencyCode || 'EUR';
      
      // Callbacks
      this.onStateChange = options.onStateChange || (() => {});
      this.onError = options.onError || ((error) => console.error('[Prinjekt Master]', error));
      
      // State
      this.state = {
        loading: false,
        initialized: false,
        parameters: {},
        pricing: {},
        modelLoaded: false,
        isDirty: false,
        error: null
      };
      
      // Three.js objects
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;
      this.currentModel = null;
      this.gridHelper = null;
      this.axesHelper = null;
      this.lights = [];
      
      // Viewer settings
      this.viewerSettings = {
        grid: true,
        axes: false,
        shadows: false, // Schatten sind deaktiviert
        wireframe: false,
        autoRotate: false,
        backgroundColor: '#F3F4F6',
        ...options.viewerSettings
      };
      
      // Animation
      this.animationFrameId = null;
      
      console.log('[Prinjekt Master] Configurator created');
    }

    // ========== INITIALIZATION ==========
    /**
     * Initialize Three.js and load parameters
     */
    async initialize() {
      try {
        this.updateState({ loading: true, error: null });
        
        // Load Three.js libraries
        await loadThreeJSLibraries();
        
        // Initialize Three.js scene
        await this.initThreeJS();
        
        // Load parameters from backend
        await this.loadParameters();
        
        // Start render loop
        this.startRenderLoop();
        
        this.updateState({ initialized: true, loading: false });
        console.log('[Prinjekt Master] ✓ Initialized successfully');
        
        return true;
      } catch (error) {
        this.handleError('Initialization failed', error);
        return false;
      }
    }

    /**
     * Initialize Three.js scene, camera, renderer, controls
     */
    async initThreeJS() {
      if (!window.THREE) {
        throw new Error('THREE.js not loaded');
      }
      
      console.log('[Prinjekt Master] Initializing Three.js...');
      
      // Scene
      this.scene = new window.THREE.Scene();
      this.scene.background = new window.THREE.Color(this.viewerSettings.backgroundColor);
      
      // Camera
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.camera = new window.THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
      this.camera.position.set(200, 150, 200);
      
      // Renderer
      this.renderer = new window.THREE.WebGLRenderer({ 
        canvas: this.canvas, 
        antialias: true, 
        alpha: true 
      });
      this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.renderer.shadowMap.enabled = this.viewerSettings.shadows;
      if (this.viewerSettings.shadows) {
        this.renderer.shadowMap.type = window.THREE.PCFSoftShadowMap;
      }
      
      // Controls
      this.controls = new window.THREE.OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.autoRotate = this.viewerSettings.autoRotate;
      this.controls.autoRotateSpeed = 2.0;
      
      // Lights (Abgleich mit dem funktionierenden alten Code)
      const ambientLight = new window.THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambientLight);
      this.lights.push(ambientLight);
      
      const directionalLight = new window.THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7);
      directionalLight.castShadow = this.viewerSettings.shadows;
      this.scene.add(directionalLight);
      this.lights.push(directionalLight);
      
      // Das Füll-Licht, das die Selbst-Verschattung (Fehler 1) behebt
      const directionalLight2 = new window.THREE.DirectionalLight(0xffffff, 0.4);
      directionalLight2.position.set(-5, -10, -7.5);
      this.scene.add(directionalLight2);
      this.lights.push(directionalLight2);
      
      // Grid Helper
      if (this.viewerSettings.grid) {
        this.gridHelper = new window.THREE.GridHelper(400, 40, 0x888888, 0xcccccc);
        this.gridHelper.position.y = 0; 
        this.scene.add(this.gridHelper);
      }
      
      // Axes Helper
      if (this.viewerSettings.axes) {
        this.axesHelper = new window.THREE.AxesHelper(100);
        this.scene.add(this.axesHelper);
      }
      
      // Handle window resize
      this.handleResize = () => {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        if (width === 0 || height === 0) return;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        
        this._fitCameraToModel(this.currentModel);
      };
      window.addEventListener('resize', this.handleResize);
      
      console.log('[Prinjekt Master] ✓ Three.js initialized');
    }

    /**
     * Start animation render loop
     */
    startRenderLoop() {
      const animate = () => {
        this.animationFrameId = requestAnimationFrame(animate);
        
        if (this.controls) {
          this.controls.update();
        }
        
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      };
      
      animate();
      console.log('[Prinjekt Master] ✓ Render loop started');
    }

    /**
     * Stop animation render loop
     */
    stopRenderLoop() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    // ========== API COMMUNICATION ==========
    /**
     * Load parameters from backend
     */
    async loadParameters() {
      try {
        console.log('[Prinjekt Master] Loading parameters...');
        
        const response = await fetch(`${this.apiBase}/get_params`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            shopify_id: this.productGid
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const backendParams = await response.json();
        console.log('[Prinjekt Master] ✓ Parameters received:', backendParams.length);
        
        // Convert backend format to our format
        const parameters = {};
        backendParams.forEach(param => {
          const description = (param.description || param.tooltip || param.help || '').trim();
          const defaultValue = param.defaultValue !== undefined ? param.defaultValue : (param.default !== undefined ? param.default : '');
          
          parameters[param.name] = {
            ...param,
            type: (param.widgetType || param.type || 'SPINBOX').toLowerCase().replace('box', ''),
            defaultValue: defaultValue,
            value: defaultValue, 
            label: param.label || param.displayName || param.name.replace(/_/g, ' '),
            description: description
          };
        });
        
        console.log('[Prinjekt Master] ✓ Parameters initialized:', Object.keys(parameters).length);
        this.updateState({ parameters });
        
        return parameters;
      } catch (error) {
        this.handleError('Failed to load parameters', error);
        throw error;
      }
    }

    /**
     * Generate 3D model from current parameters
     */
    async generateModel(calculatePrice = true) {
      try {
        this.updateState({ loading: true, error: null });
        console.log('[Prinjekt Master] Generating model...');
        
        // Prepare parameters for backend
        const backendParams = [];
        Object.entries(this.state.parameters).forEach(([key, param]) => {
          let val = param.value !== undefined ? param.value : param.defaultValue;
          
          if (param.valueType === 'number') {
            val = parseFloat(val);
            if (isNaN(val)) val = parseFloat(param.defaultValue) || 0;
          } else if (param.valueType === 'boolean') {
            if (val === null || val === undefined) {
              val = param.defaultValue === true;
            } else {
              val = val === true || val === 'true' || val === 'yes';
            }
          } else if (param.valueType === 'string') {
            if (val === null || val === undefined) {
              val = param.defaultValue || '';
            }
          }
          
          const cleanParam = {
            name: key,
            defaultValue: val,
            description: param.description || '',
            valueType: param.valueType || 'number',
            widgetType: param.widgetType || 'SPINBOX'
          };
          
          if (param.rangeConfig) cleanParam.rangeConfig = param.rangeConfig;
          if (param.dropdownOptions) cleanParam.dropdownOptions = param.dropdownOptions;
          
          backendParams.push(cleanParam);
        });
        
        console.log('[Prinjekt Master] Generating with', backendParams.length, 'parameters');
        
        // Call backend API
        const response = await fetch(`${this.apiBase}/generate_stl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            shopify_id: this.productGid,
            parameters: backendParams
          })
        });
        
        console.log('[Prinjekt Master] Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error message');
          console.error('[Prinjekt Master] Backend error:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        // Get price from headers
        const calculatedPrice = response.headers.get('X-Calculated-Price');
        const estimatedVolume = response.headers.get('x-estimated-volume');
        const originalSize = response.headers.get('x-original-size');
        
        console.log('[Prinjekt Master] Price:', calculatedPrice, 'Volume:', estimatedVolume);
        
        if (calculatedPrice) {
          const pricing = {
            total: parseFloat(calculatedPrice),
            volume: parseFloat(estimatedVolume || '0'),
            originalSize: parseFloat(originalSize || '0')
          };
          this.updateState({ pricing });
          console.log('[Prinjekt Master] ✓ Price updated:', pricing);
        }
        
        // Get DRACO blob
        const blob = await response.blob();
        console.log('[Prinjekt Master] Received blob:', blob.size, 'bytes');
        
        if (blob.size === 0) {
          throw new Error('Received empty response from server');
        }
        
        // Validate DRACO format
        const arrayBuffer = await blob.slice(0, 100).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const firstBytes = String.fromCharCode.apply(null, Array.from(uint8Array));
        
        const isDraco = firstBytes.startsWith('DRACO');
        if (!isDraco) {
          console.warn('[Prinjekt Master] ⚠️ Response may not be valid Draco format');
        } else {
          console.log('[Prinjekt Master] ✓ Valid Draco format detected');
        }
        
        // Load 3D model
        console.log('[Prinjekt Master] 🎨 Starting 3D model loading...');
        const url = URL.createObjectURL(blob);
        
        try {
          await this.loadModel(url);
          console.log('[Prinjekt Master] ✅ 3D model loaded and displayed successfully');
        } catch (modelError) {
          console.error('[Prinjekt Master] ❌ 3D model loading failed:', modelError);
          console.error('[Prinjekt Master] Error stack:', modelError.stack);
          throw new Error(`3D model loading failed: ${modelError.message}`);
        } finally {
          URL.revokeObjectURL(url);
        }
        
        this.updateState({ loading: false, modelLoaded: true, isDirty: false });
        console.log('[Prinjekt Master] ✓ Model generated successfully');
        
        return true;
      } catch (error) {
        console.error('[Prinjekt Master] ❌ Generation failed:', error);
        console.error('[Prinjekt Master] Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        this.handleError('Failed to generate model', error);
        return false;
      }
    }

    /**
     * Load 3D model (DRACO compressed) into scene
     * @param {string} url - URL to model file
     */
    async loadModel(url) {
      return new Promise((resolve, reject) => {
        console.log('[Prinjekt Master] 🔧 loadModel() called with URL:', url);
        
        if (!window.THREE) {
          const error = 'THREE.js not loaded';
          console.error('[Prinjekt Master] ❌', error);
          reject(new Error(error));
          return;
        }
        
        if (!window.THREE.DRACOLoader) {
          const error = 'DRACOLoader not available';
          console.error('[Prinjekt Master] ❌', error);
          reject(new Error(error));
          return;
        }
        
        if (!this.scene) {
          const error = 'Scene not initialized';
          console.error('[Prinjekt Master] ❌', error);
          reject(new Error(error));
          return;
        }
        
        console.log('[Prinjekt Master] ✓ All prerequisites available');
        
        // Remove existing model
        if (this.currentModel) {
          this.scene.remove(this.currentModel);
          this.currentModel.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          this.currentModel = null;
        }
        
        console.log('[Prinjekt Master] 🔄 Creating DRACOLoader...');
        
        // Setup DRACO loader
        const loader = new window.THREE.DRACOLoader();
        loader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
        
        console.log('[Prinjekt Master] ✓ DRACOLoader created, decoder path set');
        console.log('[Prinjekt Master] 🚀 Starting DRACO loader.load()...');
        
        // Load geometry
        loader.load(
          url,
          (geometry) => {
            console.log('[Prinjekt Master] ✅ DRACO decode successful!');
            console.log('[Prinjekt Master] Geometry attributes:', Object.keys(geometry.attributes));
            console.log('[Prinjekt Master] Vertex count:', geometry.attributes.position?.count || 'unknown');
            
            // ★★★ ANFORDERUNG LÖSUNG ★★★
            // Create material
            const material = new window.THREE.MeshStandardMaterial({
              color: 0xF59F27,
              metalness: 0.1,
              roughness: 0.6,
              wireframe: this.viewerSettings.wireframe,
              side: window.THREE.DoubleSide, // Behebt umgedrehte Normalen
              flatShading: false, // Behebt "Treppenstufen"-Shading
              
              // Behebt Z-Fighting (überlappende Geometrie)
              polygonOffset: true,
              polygonOffsetFactor: -0.1, // Zieht Flächen leicht nach vorne
              polygonOffsetUnits: -1
            });
            // ★★★ ENDE LÖSUNG ★★★
            
            // Create mesh
            const mesh = new window.THREE.Mesh(geometry, material);
            mesh.castShadow = this.viewerSettings.shadows;
            mesh.receiveShadow = this.viewerSettings.shadows;
            mesh.name = 'configuredModel';
            
            // Rotate to correct orientation (Z-up to Y-up)
            mesh.rotation.x = -Math.PI / 2;
            
            // Add to scene FIRST
            this.scene.add(mesh);
            this.currentModel = mesh;
            
            // Center model using Box3
            const box = new window.THREE.Box3().setFromObject(mesh);
            const center = box.getCenter(new window.THREE.Vector3());
            mesh.position.sub(center);
            
            // Recalculate box after centering to get final position
            const finalBox = new window.THREE.Box3().setFromObject(mesh);
            
            // Position grid at model's bottom edge
            if (this.gridHelper) {
              const modelBottom = finalBox.min.y;
              // Fix für Gitter-Z-Fighting
              this.gridHelper.position.y = modelBottom - 0.1; 
              console.log('[Prinjekt Master] ✓ Grid positioned at model bottom:', (modelBottom - 0.1).toFixed(2), 'mm');
            }
            
            this._fitCameraToModel(mesh);
            
            console.log('[Prinjekt Master] ✓ Model loaded');
            
            resolve(mesh);
          },
          (progress) => {
            if (progress.lengthComputable) {
              const percent = (progress.loaded / progress.total * 100).toFixed(0);
              console.log(`[Prinjekt Master] 📊 DRACO Loading Progress: ${percent}% (${progress.loaded}/${progress.total} bytes)`);
            } else {
              console.log('[Prinjekt Master] 📊 DRACO Loading...', progress.loaded, 'bytes');
            }
          },
          (error) => {
            console.error('[Prinjekt Master] ❌ DRACO Loader Error:', error);
            console.error('[Prinjekt Master] Error type:', error.constructor.name);
            console.error('[Prinjekt Master] Error message:', error.message);
            console.error('[Prinjekt Master] Error stack:', error.stack);
            reject(error);
          }
        );
      });
    }

    // ========== PARAMETER MANAGEMENT ==========
    /**
     * Update a parameter value
     * @param {string} name - Parameter name
     * @param {*} value - New value
     */
    updateParameter(name, value) {
      if (!this.state.parameters[name]) {
        console.warn(`[Prinjekt Master] Parameter "${name}" does not exist`);
        return false;
      }
      
      const parameters = { ...this.state.parameters };
      parameters[name] = { ...parameters[name], value };
      
      this.updateState({ 
        parameters, 
        isDirty: true 
      });
      
      console.log(`[Prinjekt Master] Parameter "${name}" updated to:`, value);
      return true;
    }

    /**
     * Get current parameter values
     * @returns {Object} Parameter values
     */
    getParameterValues() {
      const values = {};
      Object.entries(this.state.parameters).forEach(([key, param]) => {
        values[key] = param.value !== undefined ? param.value : param.defaultValue;
      });
      return values;
    }

    /**
     * Reset all parameters to default values
     */
    resetParameters() {
      const parameters = { ...this.state.parameters };
      Object.keys(parameters).forEach(key => {
        parameters[key].value = parameters[key].defaultValue;
      });
      
      this.updateState({ 
        parameters,
        isDirty: true 
      });
      
      console.log('[Prinjekt Master] Parameters reset to defaults');
    }

    // ========== CART OPERATIONS ==========
    /**
     * Add current configuration to Shopify cart
     * @returns {Promise<Object>} Cart response data
     */
    async addToCart() {
      try {
        this.updateState({ loading: true, error: null });
        console.log('[Prinjekt Master] Adding to cart...');
        
        // Step 1: Create variant
        const backendParams = [];
        Object.entries(this.state.parameters).forEach(([key, param]) => {
          const value = param.value !== undefined ? param.value : param.defaultValue;
          backendParams.push({
            name: key,
            defaultValue: value,
            description: param.description || '',
            valueType: param.valueType || 'number',
            widgetType: param.widgetType || 'SPINBOX',
            ...(param.dropdownOptions && { dropdownOptions: param.dropdownOptions }),
            ...(param.rangeConfig && { rangeConfig: param.rangeConfig })
          });
        });
        
        console.log('[Prinjekt Master] Creating variant...');
        const createVariantResponse = await fetch(`${this.apiBase}/create_variant`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            shopify_id: this.productGid,
            parameters: backendParams,
            price: this.state.pricing.total || 0,
            return_json: true
          })
        });
        
        if (!createVariantResponse.ok) {
          throw new Error(`Failed to create variant: ${createVariantResponse.status}`);
        }
        
        const variantData = await createVariantResponse.json();
        const variant = variantData.variants?.[0] || variantData;
        const variantId = String(variant.id || variant.variant_id || variant.variantId)
          .replace('gid://shopify/ProductVariant/', '');
        
        console.log('[Prinjekt Master] ✓ Variant created:', variantId);
        
        // Step 2: Prepare cart properties
        const properties = {};
        Object.entries(this.state.parameters).forEach(([key, param]) => {
          const value = param.value !== undefined ? param.value : param.defaultValue;
          properties[`_config_${key}`] = String(value);
        });
        
        properties['_config_price'] = String(this.state.pricing.total || 0);
        properties['_config_volume'] = String(this.state.pricing.volume || 0);
        properties['_config_timestamp'] = new Date().toISOString();
        
        // Step 3: Add to cart
        console.log('[Prinjekt Master] Adding to Shopify cart...');
        const addToCartResponse = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            id: variantId,
            quantity: 1,
            properties: properties
          })
        });
        
        if (!addToCartResponse.ok) {
          throw new Error(`Failed to add to cart: ${addToCartResponse.status}`);
        }
        
        const cartData = await addToCartResponse.json();
        console.log('[Prinjekt Master] ✓ Added to cart:', cartData);
        
        // Step 4: Update cart count
        await this.updateCartCount();
        
        this.updateState({ loading: false });
        
        return cartData;
      } catch (error) {
        this.handleError('Failed to add to cart', error);
        throw error;
      }
    }

    /**
     * Update cart count in Shopify theme (multi-strategy approach)
     */
    async updateCartCount() {
      try {
        console.log('[Prinjekt Master] 🛒 Updating cart...');
        
        // Strategy 1: Fetch fresh cart data
        const cartResponse = await fetch('/cart.js', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        
        if (!cartResponse.ok) {
          throw new Error('Failed to fetch cart');
        }
        
        const cart = await cartResponse.json();
        console.log('[Prinjekt Master] ✅ Cart data:', cart.item_count, 'items');
        
        // Strategy 2: Update cart icon bubble directly
        const cartIconBubble = document.getElementById('cart-icon-bubble');
        if (cartIconBubble) {
          const cartCount = cart.item_count || 0;
          
          const bubbleSpan = cartIconBubble.querySelector('.cart-count-bubble, [data-cart-count], .badge');
          if (bubbleSpan) {
            bubbleSpan.textContent = cartCount;
            console.log('[Prinjekt Master] ✅ Cart count updated directly:', cartCount);
          }
          
          cartIconBubble.setAttribute('data-cart-count', cartCount);
        }
        
        // Strategy 3: Dispatch multiple events (compatibility)
        const eventTypes = [
          'cart:refresh',
          'cart:updated', 
          'cart:change',
          'cartUpdated',
          'cart.requestComplete'
        ];
        
        eventTypes.forEach(eventType => {
          document.documentElement.dispatchEvent(
            new CustomEvent(eventType, {
              bubbles: true,
              detail: { cart }
            })
          );
          document.dispatchEvent(
            new CustomEvent(eventType, {
              bubbles: true,
              detail: { cart }
            })
          );
        });
        
        console.log('[Prinjekt Master] ✅ Events dispatched');
        
        // Strategy 4: Try to fetch and update sections
        try {
          const sectionsResponse = await fetch('/?sections=cart-icon-bubble', {
            credentials: 'include'
          });
          
          if (sectionsResponse.ok) {
            const sections = await sectionsResponse.json();
            
            if (sections['cart-icon-bubble']) {
              const parser = new DOMParser();
              const doc = parser.parseFromString(sections['cart-icon-bubble'], 'text/html');
              const newIcon = doc.getElementById('cart-icon-bubble');
              
              if (newIcon && cartIconBubble) {
                cartIconBubble.outerHTML = newIcon.outerHTML;
                console.log('[Prinjekt Master] ✅ Cart icon replaced via Section API');
              }
            }
          }
        } catch (sectionError) {
          console.log('[Prinjekt Master] Section API not available (this is OK)');
        }
        
        // Strategy 5: Update cart drawer if it exists
        const cartDrawer = document.querySelector('cart-drawer');
        if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
          try {
            const drawerResponse = await fetch('/?sections=cart-drawer', {
              credentials: 'include'
            });
            
            if (drawerResponse.ok) {
              const sections = await drawerResponse.json();
              cartDrawer.renderContents({
                sections: sections,
                id: cart.items?.[0]?.id || null
              });
              console.log('[Prinjekt Master] ✅ Cart drawer updated');
            }
          } catch (drawerError) {
            console.log('[Prinjekt Master] Cart drawer update skipped');
          }
        }
        
        console.log('[Prinjekt Master] ✅ Cart update complete');
        
      } catch (error) {
        console.error('[Prinjekt Master] ❌ Failed to update cart:', error);
      }
    }

    // ========== VIEWER SETTINGS ==========
    /**
     * Update viewer setting
     * @param {string} setting - Setting name
     * @param {boolean} value - New value
     */
    updateViewerSetting(setting, value) {
      this.viewerSettings[setting] = value;
      
      switch (setting) {
        case 'grid':
          if (this.gridHelper) {
            this.gridHelper.visible = value;
          } else if (value) {
            this.gridHelper = new window.THREE.GridHelper(400, 40, 0x888888, 0xcccccc);
            this.scene.add(this.gridHelper);
          }
          break;
          
        case 'axes':
          if (this.axesHelper) {
            this.axesHelper.visible = value;
          } else if (value) {
            this.axesHelper = new window.THREE.AxesHelper(100);
            this.scene.add(this.axesHelper);
          }
          break;
          
        case 'shadows':
          this.renderer.shadowMap.enabled = value;
          if (this.currentModel) {
            this.currentModel.castShadow = value;
            this.currentModel.receiveShadow = value;
          }
          this.lights.forEach(light => {
            if (light.castShadow !== undefined) {
              light.castShadow = value;
            }
          });
          break;
          
        case 'wireframe':
          if (this.currentModel && this.currentModel.material) {
            this.currentModel.material.wireframe = value;
          }
          break;
          
        case 'autoRotate':
          if (this.controls) {
            this.controls.autoRotate = value;
          }
          break;
          
        case 'backgroundColor':
          if (this.scene) {
            this.scene.background = new window.THREE.Color(value);
          }
          break;
      }
      
      console.log(`[Prinjekt Master] Viewer setting "${setting}" = ${value}`);
    }

    // ========== STATE MANAGEMENT ==========
    /**
     * Update internal state and trigger callback
     * @param {Object} updates - State updates
     */
    updateState(updates) {
      this.state = { ...this.state, ...updates };
      this.onStateChange(this.state);
    }

    /**
     * Get current state
     * @returns {Object} Current state
     */
    getState() {
      return { ...this.state };
    }

    // ========== CONFIGURATION SAVE/LOAD ==========
    /**
     * Get current configuration for saving
     * @returns {Object} Configuration object with parameters and model URL
     */
    getCurrentConfig() {
      const parameters = {};
      Object.entries(this.state.parameters).forEach(([key, param]) => {
        parameters[key] = {
          name: key,
          value: param.value !== undefined ? param.value : param.defaultValue,
          label: param.label,
          type: param.type,
          valueType: param.valueType,
          defaultValue: param.defaultValue
        };
        
        // Include range config if exists
        if (param.rangeConfig) {
          parameters[key].rangeConfig = param.rangeConfig;
        }
        
        // Include dropdown options if exists
        if (param.dropdownOptions) {
          parameters[key].dropdownOptions = param.dropdownOptions;
        }
      });
      
      return {
        parameters: parameters,
        modelUrl: this.currentModel ? 'generated' : null,
        pricing: this.state.pricing
      };
    }

    /**
     * Load configuration from saved data
     * @param {Object} parameters - Parameters object from saved configuration
     */
    loadConfiguration(parameters) {
      if (!parameters) {
        console.warn('[Prinjekt Master] No parameters provided to loadConfiguration');
        return false;
      }
      
      console.log('[Prinjekt Master] Loading configuration...', parameters);
      
      // Update each parameter value
      const updatedParams = { ...this.state.parameters };
      
      Object.entries(parameters).forEach(([key, savedParam]) => {
        if (updatedParams[key]) {
          // Update the value from saved config
          updatedParams[key].value = savedParam.value !== undefined ? savedParam.value : savedParam.defaultValue;
          console.log(`[Prinjekt Master] Loaded parameter "${key}":`, updatedParams[key].value);
        }
      });
      
      // Update state with loaded parameters
      this.updateState({ 
        parameters: updatedParams,
        isDirty: true // Mark as dirty so user knows to update preview
      });
      
      console.log('[Prinjekt Master] ✓ Configuration loaded successfully');
      return true;
    }

    // ========== ERROR HANDLING ==========
    /**
     * Handle errors consistently
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    handleError(message, error) {
      const errorObj = {
        message,
        error: error.message || error,
        timestamp: new Date().toISOString()
      };
      
      this.updateState({ 
        loading: false, 
        error: errorObj 
      });
      
      this.onError(errorObj);
      console.error(`[Prinjekt Master] ${message}:`, error);
    }
    
    // ========== ★ KORRIGIERTE VERSION (Oberes Drittel): Kamera-Zentrierung ★ ==========
    /**
     * Passt Kamera-Zoom und -Ziel an das Modell an.
     * Auf Mobilgeräten (<= 1024px) wird das Ziel (target) so verschoben,
     * dass das Modell im oberen Drittel des Viewports erscheint, 
     * unabhängig von der konfigurierten Größe.
     * @param {THREE.Object3D} model - Das 3D-Modell
     */
    _fitCameraToModel(model) {
      if (!model || !this.camera || !this.controls || !this.renderer) return;

      // 1. Bounding Box des (bereits auf 0,0,0 zentrierten) Modells holen
      const box = new window.THREE.Box3().setFromObject(model);
      
      const size = box.getSize(new window.THREE.Vector3());
      const center = box.getCenter(new window.THREE.Vector3()); // Sollte (0,0,0) sein
      
      // 2. Kamera-Zoom berechnen (Skaliert auf die größte Dimension des Modells)
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      
      const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
      if (isNaN(aspect) || aspect === 0) return; // Verhindert Div/0 Fehler
      
      // Diese Formel berechnet den Abstand, der nötig ist, um 'maxDim' formatfüllend anzuzeigen
      let cameraZ = Math.abs( (maxDim / (aspect > 1 ? 2 : 2 * aspect)) / Math.tan(fov / 2) );
      
      // WICHTIG: Das Padding MUSS hier angewendet werden, da es die "sichtbare Höhe" definiert
      cameraZ *= 1.5; // 50% Abstand/Padding
      
      this.camera.position.set(cameraZ, cameraZ * 0.7, cameraZ);

      // 3. ★ Kamera-Ziel (Target) berechnen ★
      let targetY = center.y; // Standard-Ziel (0, 0, 0)
      
      
      // 4. Kamera-Ziel anwenden
      this.camera.lookAt(center.x, targetY, center.z);
      this.controls.target.set(center.x, targetY, center.z);
      this.controls.update();
    }


    // ========== CLEANUP ==========
    /**
     * Destroy configurator and cleanup resources
     */
    destroy() {
      console.log('[Prinjekt Master] Destroying configurator...');
      
      // Stop render loop
      this.stopRenderLoop();
      
      // Remove event listeners
      if (this.handleResize) {
        window.removeEventListener('resize', this.handleResize);
      }
      
      // Dispose Three.js objects
      if (this.currentModel) {
        this.scene.remove(this.currentModel);
        this.currentModel.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      
      if (this.renderer) {
        this.renderer.dispose();
      }
      
      if (this.controls) {
        this.controls.dispose();
      }
      
      console.log('[Prinjekt Master] ✓ Destroyed');
    }
  }

  // ========== EXPORT ==========
  // Make it available globally
  window.PrinjektConfigurator = PrinjektConfigurator;
  
  console.log('[Prinjekt Master] Logic library loaded');
  
})(window);