// ===== VARIABLES GLOBALES MEJORADAS =====
// Variables globales para conexiones Arduino
let sensorsPort = null;
let pumpPort = null;
let sensorsConnected = false;
let pumpConnected = false;
let sensorsReader = null;
let pumpReader = null;
let lastDataReceived = 0;

// Variables globales del sistema
let sensorData = {
    gas: [],
    ultrasonic: [],
    soil: [],
    temperature: [],
    humidity: [],
    timestamps: []
};

let alertStats = {
    bueno: 0,
    regular: 0,
    malo: 0,
    peligroso: 0
};

// ===== NUEVOS PARÁMETROS CONFIGURABLES =====
let gasParameters = {
    bueno: 30,        // 0 a 30 = Bueno
    regular: 100,     // 30 a 100 = Regular  
    malo: 150,        // 100 a 150 = Malo
    peligroso: 151    // 150+ = Peligroso
};

let ultrasonicParameters = {
    minimo: 5,        // 0 a 5 cm = Nivel mínimo (vacío)
    regular: 15,      // 5 a 15 cm = Nivel regular
    maximo: 25        // 15 a 25 cm = Nivel máximo (lleno)
};

let plantParameters = {
    soilOptimal: 50,
    soilMin: 25,
    soilMax: 75,
    tempOptimal: 25,
    humidOptimal: 60,
    tempMin: 15,
    tempMax: 35,
    humidityMin: 40,
    humidityMax: 80,
    gasThreshold: 300,
    irrigationDuration: 30
};

let systemStats = {
    totalReadings: 0,
    alertCount: 0,
    irrigationCount: 0,
    startTime: Date.now(),
    backupInterval: null
};

// ===== SISTEMA DE ALERTAS MEJORADO =====
let alertHistory = [];
let noSensorMode = true;
let pumpActive = false;
let autoModeActive = false;
let charts = {};
let emergencyStopActive = false;

// Control de alertas para evitar spam
let lastAlertTime = {
    gas: 0,
    ultrasonic: 0,
    soil: 0,
    temperature: 0,
    humidity: 0
};
// Variables para mantener valores estables (AGREGAR al inicio de tu archivo)
let stableSensorValues = {
    gas: 0,
    ultrasonic: 0,
    soil: 0,
    temperature: 0,
    humidity: 0,
    lastUpdate: 0
};

// Control de actualizaciones
let lastRealUpdate = 0;
let UPDATE_INTERVAL = 2000; // 2 segundos entre actualizaciones de display

// Variable para estado real del Arduino (AGREGAR)
let realPumpState = false;

let currentAlertModal = null;
const ALERT_COOLDOWN = 5000; // 5 segundos entre alertas del mismo tipo

// NUEVA VARIABLE CRÍTICA PARA CONTROLAR GRÁFICAS
let chartsInitialized = false;
let shouldUpdateCharts = false; // ESTA ES LA CLAVE


// ===== SISTEMA DE ALERTAS NO INVASIVAS (ESQUINA SUPERIOR DERECHA) =====
function showToastAlert(message, type = 'info', sensorType = null) {
    // Verificar cooldown para evitar spam de alertas del mismo sensor
    if (sensorType) {
        const now = Date.now();
        if (now - lastAlertTime[sensorType] < ALERT_COOLDOWN) {
            console.log(`Alerta de ${sensorType} en cooldown, ignorando`);
            return;
        }
        lastAlertTime[sensorType] = now;
    }
    
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Crear contenedor de toasts si no existe
    let toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            max-width: 350px;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
    }
    
    // Colores según tipo
    const colors = {
        success: '#4CAF50',
        danger: '#f44336',
        warning: '#ff9800',
        info: '#2196F3'
    };
    
    // Iconos según tipo
    const icons = {
        success: '✅',
        danger: '🚨',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    // Crear toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: white;
        color: #333;
        padding: 15px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        border-left: 4px solid ${colors[type] || colors.info};
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 300px;
        pointer-events: auto;
        cursor: pointer;
        transition: all 0.3s ease;
        animation: slideInRight 0.3s ease;
        font-size: 0.9rem;
        position: relative;
        overflow: hidden;
    `;
    
    // Contenido del toast
    toast.innerHTML = `
        <span style="font-size: 1.2rem;">${icons[type] || icons.info}</span>
        <span style="flex: 1; font-weight: 500;">${message}</span>
        <span style="opacity: 0.7; font-size: 0.8rem; cursor: pointer;">✕</span>
    `;
    
    // Barra de progreso
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: ${colors[type] || colors.info};
        width: 100%;
        animation: toastProgress 4s linear;
    `;
    toast.appendChild(progressBar);
    
    // Añadir al contenedor
    toastContainer.appendChild(toast);
    
    // Auto-remover después de 4 segundos
    const autoRemove = setTimeout(() => {
        removeToast(toast);
    }, 4000);
    
    // Remover al hacer click
    toast.addEventListener('click', () => {
        clearTimeout(autoRemove);
        removeToast(toast);
    });
    
    // Hover para pausar
    toast.addEventListener('mouseenter', () => {
        progressBar.style.animationPlayState = 'paused';
    });
    
    toast.addEventListener('mouseleave', () => {
        progressBar.style.animationPlayState = 'running';
    });
    
    // Solo agregar al historial si no es modo sin sensores
    if (!noSensorMode || sensorsConnected) {
        alertHistory.push({
            message: message,
            type: type,
            sensorType: sensorType,
            timestamp: new Date().toISOString()
        });
        
        // Mantener solo los últimos 50 registros
        if (alertHistory.length > 50) {
            alertHistory.shift();
        }
        
        // Incrementar contadores de alertas solo una vez
        if (type !== 'success' && type !== 'info') {
            systemStats.alertCount++;
        }
    }
}

function removeToast(toast) {
    if (toast && toast.parentNode) {
        toast.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

// Reemplazar la función showModalAlert original
function showModalAlert(message, type = 'info', sensorType = null) {
    // Para alertas críticas que requieren atención inmediata, usar modal
    if (type === 'danger' && (message.includes('EMERGENCIA') || message.includes('PELIGROSO'))) {
        showCriticalModal(message, type);
    } else {
        // Para el resto, usar toast no invasivo
        showToastAlert(message, type, sensorType);
    }
}

// Modal solo para emergencias críticas
function showCriticalModal(message, type) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 20000;
        animation: fadeIn 0.3s ease;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
        border: 3px solid #f44336;
    `;
    
    content.innerHTML = `
        <div style="font-size: 3rem; margin-bottom: 15px; animation: shake 0.5s infinite;">
            🚨
        </div>
        <div style="font-size: 1.3rem; font-weight: bold; color: #f44336; margin-bottom: 20px;">
            ${message}
        </div>
        <button id="criticalOkBtn" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 15px 40px;
            border-radius: 8px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            animation: pulse 1s infinite;
        ">
            ENTENDIDO
        </button>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    document.getElementById('criticalOkBtn').onclick = () => {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    };
}

// ===== FUNCIONES DE EVALUACIÓN CON NUEVOS PARÁMETROS =====
function evaluateGasLevel(gasValue) {
    if (gasValue <= gasParameters.bueno) {
        return { level: 'normal', message: 'Aire limpio', icon: '🟢' };
    } else if (gasValue <= gasParameters.regular) {
        return { level: 'warning', message: 'Calidad regular', icon: '🟡' };
    } else if (gasValue <= gasParameters.malo) {
        return { level: 'danger', message: 'Aire contaminado', icon: '🟠' };
    } else {
        return { level: 'critical', message: '¡PELIGROSO!', icon: '🔴' };
    }
}

function evaluateUltrasonicLevel(ultraValue) {
    if (ultraValue <= 0) {
        return { level: 'normal', message: 'Sin datos del sensor', icon: '❌' };
    } else if (ultraValue <= ultrasonicParameters.minimo) {
        return { level: 'danger', message: 'Nivel mínimo - Vacío', icon: '🔴' };
    } else if (ultraValue <= ultrasonicParameters.regular) {
        return { level: 'warning', message: 'Nivel regular', icon: '🟡' };
    } else if (ultraValue <= ultrasonicParameters.maximo) {
        return { level: 'normal', message: 'Nivel máximo - Lleno', icon: '🟢' };
    } else {
        return { level: 'critical', message: '¡DESBORDE!', icon: '⚠️' };
    }
}

function getSoilStatus(soilValue) {
    if (soilValue === 0) {
        return { level: 'normal', message: 'Sin datos del sensor', shouldAlert: false };
    }
    
    if (soilValue >= plantParameters.soilMin && soilValue <= plantParameters.soilMax) {
        return { level: 'normal', message: 'Humedad óptima', shouldAlert: false };
    } else if (soilValue < plantParameters.soilMin) {
        const criticalLevel = plantParameters.soilMin * 0.7;
        const isCritical = soilValue < criticalLevel;
        return { 
            level: isCritical ? 'danger' : 'warning', 
            message: isCritical ? 'Suelo muy seco - ¡RIEGO URGENTE!' : 'Suelo seco - Necesita riego',
            shouldAlert: true,
            alertType: isCritical ? 'danger' : 'warning'
        };
    } else {
        return { 
            level: 'warning', 
            message: 'Suelo muy húmedo - Reducir riego', 
            shouldAlert: true,
            alertType: 'warning' 
        };
    }
}

function getTemperatureStatus(tempValue) {
    if (tempValue === 0) {
        return { level: 'normal', message: 'Sin datos', shouldAlert: false };
    }
    
    const tempDiff = Math.abs(tempValue - plantParameters.tempOptimal);
    
    if (tempDiff < 3) {
        return { level: 'normal', message: 'Temperatura óptima', shouldAlert: false };
    } else if (tempDiff < 7) {
        return { level: 'warning', message: 'Temperatura moderada', shouldAlert: false };
    } else {
        const isExtreme = tempDiff > 15;
        return {
            level: isExtreme ? 'danger' : 'warning',
            message: isExtreme ? 'Temperatura extrema - ¡REVISAR!' : 'Temperatura no ideal',
            shouldAlert: isExtreme,
            alertType: 'warning'
        };
    }
}

function getHumidityStatus(humidValue) {
    if (humidValue === 0) {
        return { level: 'normal', message: 'Sin datos', shouldAlert: false };
    }
    
    const humidDiff = Math.abs(humidValue - plantParameters.humidOptimal);
    
    if (humidDiff < 10) {
        return { level: 'normal', message: 'Humedad ideal', shouldAlert: false };
    } else if (humidDiff < 20) {
        return { level: 'warning', message: 'Humedad aceptable', shouldAlert: false };
    } else {
        const isExtreme = humidDiff > 30;
        return {
            level: isExtreme ? 'danger' : 'warning',
            message: isExtreme ? 'Humedad extrema - ¡REVISAR!' : 'Humedad no ideal',
            shouldAlert: isExtreme,
            alertType: 'warning'
        };
    }
}

// ===== FUNCIONES PARA CONFIGURAR PARÁMETROS =====
function updateGasParameters() {
    const bueno = parseInt(document.getElementById('gasGoodMax').value) || 30;
    const regular = parseInt(document.getElementById('gasRegularMax').value) || 100;
    const malo = parseInt(document.getElementById('gasBadMax').value) || 150;
    
    // Validar que los valores sean lógicos
    if (bueno >= regular || regular >= malo) {
        showToastAlert('Error: Los valores deben ser: Bueno < Regular < Malo', 'danger');
        return;
    }
    
    gasParameters = {
        bueno: bueno,
        regular: regular,
        malo: malo,
        peligroso: malo + 1
    };
    
    updateGasParametersDisplay();
    showToastAlert('Parámetros de gas actualizados correctamente', 'success');
}

function updateUltrasonicParameters() {
    const minimo = parseInt(document.getElementById('ultraMinMax').value) || 5;
    const regular = parseInt(document.getElementById('ultraRegularMax').value) || 15;
    const maximo = parseInt(document.getElementById('ultraMaxMax').value) || 25;
    
    // Validar que los valores sean lógicos
    if (minimo >= regular || regular >= maximo) {
        showToastAlert('Error: Los valores deben ser: Mínimo < Regular < Máximo', 'danger');
        return;
    }
    
    ultrasonicParameters = {
        minimo: minimo,
        regular: regular,
        maximo: maximo
    };
    
    updateUltrasonicParametersDisplay();
    showToastAlert('Parámetros de ultrasonido actualizados correctamente', 'success');
}

function updateGasParametersDisplay() {
    const display = document.getElementById('gasParametersDisplay');
    if (display) {
        display.innerHTML = `
            <strong>Parámetros de Gas:</strong><br>
            🟢 Bueno: 0 - ${gasParameters.bueno}<br>
            🟡 Regular: ${gasParameters.bueno + 1} - ${gasParameters.regular}<br>
            🟠 Malo: ${gasParameters.regular + 1} - ${gasParameters.malo}<br>
            🔴 Peligroso: ${gasParameters.malo + 1}+
        `;
    }
}

function updateUltrasonicParametersDisplay() {
    const display = document.getElementById('ultraParametersDisplay');
    if (display) {
        display.innerHTML = `
            <strong>Parámetros de Ultrasonido:</strong><br>
            🔴 Mínimo (Vacío): 0 - ${ultrasonicParameters.minimo} cm<br>
            🟡 Regular: ${ultrasonicParameters.minimo + 1} - ${ultrasonicParameters.regular} cm<br>
            🟢 Máximo (Lleno): ${ultrasonicParameters.regular + 1} - ${ultrasonicParameters.maximo} cm<br>
            ⚠️ Desborde: ${ultrasonicParameters.maximo + 1}+ cm
        `;
    }
}


// ===== SOLUCIÓN DEFINITIVA PARA EL PROBLEMA DEL CANVAS =====
// Reemplaza COMPLETAMENTE la función initializeCharts() con esta versión corregida

function initializeCharts() {
    try {
        if (typeof Chart === 'undefined') {
            console.error('Chart.js no está cargado');
            return;
        }

        console.log('Inicializando gráficas con altura fija...');

        // IMPORTANTE: Configuración global de Chart.js para evitar redimensionamiento
        Chart.defaults.responsive = false; // DESACTIVAR responsive
        Chart.defaults.maintainAspectRatio = false; // DESACTIVAR aspect ratio

        // Gráfica de sensores en tiempo real
        const sensorsCanvas = document.getElementById('sensorsChart');
        if (sensorsCanvas) {
            // FORZAR dimensiones del canvas
            sensorsCanvas.width = 400;
            sensorsCanvas.height = 300;
            sensorsCanvas.style.width = '400px';
            sensorsCanvas.style.height = '300px';
            
            const sensorsCtx = sensorsCanvas.getContext('2d');
            charts.sensors = new Chart(sensorsCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Humedad Suelo (%)',
                            data: [],
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            tension: 0.4,
                            fill: false
                        },
                        {
                            label: 'Temperatura (°C)',
                            data: [],
                            borderColor: '#FF5722',
                            backgroundColor: 'rgba(255, 87, 34, 0.1)',
                            tension: 0.4,
                            fill: false
                        },
                        {
                            label: 'Humedad Aire (%)',
                            data: [],
                            borderColor: '#2196F3',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            tension: 0.4,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: false, // CRÍTICO: NO responsive
                    maintainAspectRatio: false, // CRÍTICO: NO mantener aspecto
                    width: 400, // Ancho fijo
                    height: 300, // Alto fijo
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                color: 'rgba(0,0,0,0.1)'
                            }
                        },
                        x: {
                            grid: {
                                color: 'rgba(0,0,0,0.1)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top'
                        }
                    },
                    animation: false // SIN ANIMACIÓN
                }
            });
        }
        
        // Gráfica de alertas - LA MÁS PROBLEMÁTICA
        const alertsCanvas = document.getElementById('alertsChart');
        if (alertsCanvas) {
            // FORZAR dimensiones del canvas ANTES de crear el gráfico
            alertsCanvas.width = 300;
            alertsCanvas.height = 300;
            alertsCanvas.style.width = '300px !important';
            alertsCanvas.style.height = '300px !important';
            
            // QUITAR cualquier estilo inline problemático
            alertsCanvas.removeAttribute('style');
            alertsCanvas.style.cssText = 'width: 300px !important; height: 300px !important; display: block; box-sizing: border-box;';
            
            const alertsCtx = alertsCanvas.getContext('2d');
            charts.alerts = new Chart(alertsCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Bueno', 'Regular', 'Malo', 'Peligroso'],
                    datasets: [{
                        data: [0, 0, 0, 0],
                        backgroundColor: [
                            '#4CAF50',
                            '#FF9800',
                            '#F44336',
                            '#E91E63'
                        ],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: false, // CRÍTICO: NO responsive
                    maintainAspectRatio: false, // CRÍTICO: NO mantener aspecto
                    width: 300, // Ancho fijo
                    height: 300, // Alto fijo
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    },
                    animation: false // SIN ANIMACIÓN
                }
            });
        }
        
        // Gráfica de gas
        const gasCanvas = document.getElementById('gasChart');
        if (gasCanvas) {
            gasCanvas.width = 400;
            gasCanvas.height = 300;
            gasCanvas.style.width = '400px';
            gasCanvas.style.height = '300px';
            
            const gasCtx = gasCanvas.getContext('2d');
            charts.gas = new Chart(gasCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Nivel de Gas',
                        data: [],
                        borderColor: '#FF5722',
                        backgroundColor: 'rgba(255, 87, 34, 0.2)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    width: 400,
                    height: 300,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    },
                    animation: false
                }
            });
        }
        
        // Gráfica de ultrasonido
        const ultraCanvas = document.getElementById('ultraChart');
        if (ultraCanvas) {
            ultraCanvas.width = 300;
            ultraCanvas.height = 300;
            ultraCanvas.style.width = '300px';
            ultraCanvas.style.height = '300px';
            
            const ultraCtx = ultraCanvas.getContext('2d');
            charts.ultrasonic = new Chart(ultraCtx, {
                type: 'bar',
                data: {
                    labels: ['Nivel Actual'],
                    datasets: [{
                        label: 'Distancia (cm)',
                        data: [0],
                        backgroundColor: '#cccccc',
                        borderColor: '#999',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    width: 300,
                    height: 300,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 50
                        }
                    },
                    animation: false
                }
            });
        }
        
        // Gráfica de riego
        const irrigationCanvas = document.getElementById('irrigationChart');
        if (irrigationCanvas) {
            irrigationCanvas.width = 300;
            irrigationCanvas.height = 300;
            irrigationCanvas.style.width = '300px';
            irrigationCanvas.style.height = '300px';
            
            const irrigationCtx = irrigationCanvas.getContext('2d');
            charts.irrigation = new Chart(irrigationCtx, {
                type: 'bar',
                data: {
                    labels: ['Riegos Realizados'],
                    datasets: [{
                        label: 'Cantidad',
                        data: [0],
                        backgroundColor: '#2196F3',
                        borderColor: '#1976D2',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    width: 300,
                    height: 300,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    },
                    animation: false
                }
            });
        }
        
        chartsInitialized = true;
        shouldUpdateCharts = false;
        
        // CRÍTICO: Bloquear cualquier redimensionamiento posterior
        setTimeout(() => {
            const allCanvases = document.querySelectorAll('canvas');
            allCanvases.forEach(canvas => {
                if (canvas.id.includes('Chart')) {
                    // Prevenir cambios de estilo
                    const observer = new MutationObserver((mutations) => {
                        mutations.forEach((mutation) => {
                            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                                const currentHeight = parseInt(canvas.style.height);
                                if (currentHeight > 400) {
                                    console.log('Bloqueando altura excesiva en', canvas.id, currentHeight);
                                    canvas.style.height = '300px';
                                    canvas.height = 300;
                                }
                            }
                        });
                    });
                    
                    observer.observe(canvas, {
                        attributes: true,
                        attributeFilter: ['style']
                    });
                }
            });
        }, 1000);
        
        console.log('Gráficas inicializadas con altura fija y protección activa');
        
    } catch (error) {
        console.error('Error inicializando gráficas:', error);
    }
}

// ===== FUNCIÓN DE EMERGENCIA PARA RESETEAR CANVAS =====
function resetCanvasHeights() {
    console.log('Reseteando alturas de canvas...');
    
    const canvasIds = ['sensorsChart', 'alertsChart', 'gasChart', 'ultraChart', 'irrigationChart'];
    
    canvasIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            console.log(`Reseteando ${id} - altura actual:`, canvas.style.height);
            
            // Forzar dimensiones
            canvas.width = 350;
            canvas.height = 300;
            canvas.style.width = '350px !important';
            canvas.style.height = '300px !important';
            canvas.style.maxHeight = '300px !important';
            
            // Remover estilos problemáticos
            canvas.removeAttribute('style');
            canvas.style.cssText = 'width: 350px !important; height: 300px !important; max-height: 300px !important; display: block; box-sizing: border-box;';
        }
    });
    
    // Reinicializar gráficas si es necesario
    if (chartsInitialized) {
        Object.keys(charts).forEach(key => {
            if (charts[key]) {
                charts[key].destroy();
            }
        });
        charts = {};
        chartsInitialized = false;
        setTimeout(initializeCharts, 500);
    }
}

// ===== LLAMAR ESTO INMEDIATAMENTE PARA DETENER EL CRECIMIENTO =====
window.resetCanvasHeights = resetCanvasHeights;

// Auto-ejecutar el reseteo cada 5 segundos como medida de emergencia
setInterval(() => {
    const alertsCanvas = document.getElementById('alertsChart');
    if (alertsCanvas) {
        const currentHeight = parseInt(alertsCanvas.style.height);
        if (currentHeight > 400) {
            console.log('Altura excesiva detectada:', currentHeight, 'px - Reseteando...');
            resetCanvasHeights();
        }
    }
}, 5000);

// ===== FUNCIÓN DE ACTUALIZACIÓN DE GRÁFICAS COMPLETAMENTE CORREGIDA =====
function updateCharts() {
    try {
        console.log('updateCharts llamado - Verificando condiciones...');
        console.log('chartsInitialized:', chartsInitialized);
        console.log('shouldUpdateCharts:', shouldUpdateCharts);
        console.log('sensorsConnected:', sensorsConnected);
        console.log('noSensorMode:', noSensorMode);
        console.log('sensorData.timestamps.length:', sensorData.timestamps.length);
        
        // REGLA #1: Si las gráficas no están inicializadas, salir
        if (!chartsInitialized) {
            console.log('Gráficas no inicializadas, saliendo...');
            return;
        }
        
        // REGLA #2: Solo actualizar si shouldUpdateCharts es true
        if (!shouldUpdateCharts) {
            console.log('shouldUpdateCharts es false, no actualizando gráficas');
            return;
        }
        
        // REGLA #3: Solo actualizar si hay sensores conectados
        if (!sensorsConnected) {
            console.log('Sensores no conectados, no actualizando gráficas');
            return;
        }
        
        // REGLA #4: Solo actualizar si NO estamos en modo sin sensores
        if (noSensorMode) {
            console.log('En modo sin sensores, no actualizando gráficas');
            return;
        }
        
        // REGLA #5: Solo actualizar si hay datos reales
        if (sensorData.timestamps.length === 0) {
            console.log('Sin timestamps, no hay datos reales');
            return;
        }
        
        console.log('Todas las condiciones cumplidas, actualizando gráficas...');
        
        const maxPoints = 10;
        
        // Actualizar gráfica de sensores
        if (charts.sensors) {
            charts.sensors.data.labels = sensorData.timestamps.slice(-maxPoints);
            charts.sensors.data.datasets[0].data = sensorData.soil.slice(-maxPoints);
            charts.sensors.data.datasets[1].data = sensorData.temperature.slice(-maxPoints);
            charts.sensors.data.datasets[2].data = sensorData.humidity.slice(-maxPoints);
            charts.sensors.update('none');
            console.log('Gráfica de sensores actualizada');
        }
        
        // Actualizar gráfica de gas
        if (charts.gas && sensorData.gas.length > 0) {
            charts.gas.data.labels = sensorData.timestamps.slice(-maxPoints);
            charts.gas.data.datasets[0].data = sensorData.gas.slice(-maxPoints);
            charts.gas.update('none');
            console.log('Gráfica de gas actualizada');
        }
        
        // Actualizar gráfica de ultrasonido solo con datos válidos
        if (charts.ultrasonic && sensorData.ultrasonic.length > 0) {
            const lastUltrasonic = sensorData.ultrasonic[sensorData.ultrasonic.length - 1];
            if (lastUltrasonic > 0) {
                charts.ultrasonic.data.datasets[0].data = [lastUltrasonic];
                
                // Cambiar color según nivel
                let color = '#4CAF50';
                if (lastUltrasonic <= ultrasonicParameters.minimo) color = '#F44336';
                else if (lastUltrasonic <= ultrasonicParameters.regular) color = '#FF9800';
                else if (lastUltrasonic > ultrasonicParameters.maximo) color = '#9C27B0';
                
                charts.ultrasonic.data.datasets[0].backgroundColor = color;
                charts.ultrasonic.update('none');
                console.log('Gráfica de ultrasonido actualizada');
            }
        }
        
        // Actualizar gráfica de alertas solo con datos reales
        if (charts.alerts) {
            const totalAlerts = alertStats.bueno + alertStats.regular + alertStats.malo + alertStats.peligroso;
            if (totalAlerts > 0) {
                charts.alerts.data.datasets[0].data = [
                    alertStats.bueno,
                    alertStats.regular,
                    alertStats.malo,
                    alertStats.peligroso
                ];
                charts.alerts.update('none');
                console.log('Gráfica de alertas actualizada');
            }
        }
        
        // Actualizar gráfica de riego solo cuando hay riegos reales
        if (charts.irrigation && systemStats.irrigationCount > 0) {
            charts.irrigation.data.datasets[0].data = [systemStats.irrigationCount];
            charts.irrigation.update('none');
            console.log('Gráfica de riego actualizada');
        }
        
        console.log('Actualización de gráficas completada');
        
    } catch (error) {
        console.error('Error actualizando gráficas:', error);
    }
}

// ===== INICIALIZAR MODO SIN SENSORES CORREGIDO =====
function initializeNoSensorDisplay() {
    console.log('Inicializando modo sin sensores...');
    
    // Limpiar completamente los arrays de datos
    sensorData = {
        gas: [],
        ultrasonic: [],
        soil: [],
        temperature: [],
        humidity: [],
        timestamps: []
    };
    
    // IMPORTANTE: Desactivar actualizaciones de gráficas
    shouldUpdateCharts = false;
    
    // Actualizar tarjetas con valores 0 y estado correcto
    updateSensorCardsImproved(0, 0, 0, 0, 0);
    
    const dataDisplay = document.getElementById('sensorsData');
    if (dataDisplay) {
        dataDisplay.innerHTML = `Gas: 0
Ultrasonido: 0 cm
Suelo: 0%
Temperatura: 0°C
Humedad: 0%
Estado: Sin sensores conectados`;
    }
    
    // Limpiar gráficas si están inicializadas
    if (chartsInitialized) {
        if (charts.sensors) {
            charts.sensors.data.labels = [];
            charts.sensors.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            charts.sensors.update('none');
        }
        
        if (charts.gas) {
            charts.gas.data.labels = [];
            charts.gas.data.datasets[0].data = [];
            charts.gas.update('none');
        }
        
        if (charts.ultrasonic) {
            charts.ultrasonic.data.datasets[0].data = [0];
            charts.ultrasonic.data.datasets[0].backgroundColor = '#cccccc';
            charts.ultrasonic.update('none');
        }
        
        if (charts.alerts) {
            charts.alerts.data.datasets[0].data = [0, 0, 0, 0];
            charts.alerts.update('none');
        }
        
        if (charts.irrigation) {
            charts.irrigation.data.datasets[0].data = [0];
            charts.irrigation.update('none');
        }
    }
    
    console.log('Modo sin sensores inicializado - gráficas pausadas');
}

// ===== FUNCIONES DE CONEXIÓN ARDUINO MEJORADAS =====
async function connectSensorsArduino() {
    const connectBtn = document.getElementById('connectSensors');
    const disconnectBtn = document.getElementById('disconnectSensors');
    const statusSpan = document.getElementById('sensorsStatus');
    const card = document.getElementById('sensorsArduino');
    const logDiv = document.getElementById('sensorsLog');

    if (!navigator.serial) {
        showToastAlert('Web Serial API no soportada. Usa Chrome/Edge con HTTPS', 'danger');
        return;
    }

    try {
        connectBtn.disabled = true;
        statusSpan.textContent = '🟡 Conectando...';
        logDiv.textContent = 'Solicitando puerto serie para sensores...';

        const filters = [
            { usbVendorId: 0x2341 }, // Arduino Uno/Nano
            { usbVendorId: 0x1A86 }, // CH340 chips
            { usbVendorId: 0x0403 }  // FTDI chips
        ];

        sensorsPort = await navigator.serial.requestPort({ filters });
        
        if (sensorsPort.readable) {
            await sensorsPort.close();
        }
        
        const openPromise = sensorsPort.open({ 
            baudRate: parseInt(document.getElementById('sensorsBaud')?.value || '9600'),
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 255,
            flowControl: 'none'
        });

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout al abrir puerto')), 10000)
        );

        await Promise.race([openPromise, timeoutPromise]);

        // IMPORTANTE: Activar modo con sensores y permitir actualizaciones de gráficas
        sensorsConnected = true;
        noSensorMode = false;
        shouldUpdateCharts = true; // ACTIVAR actualizaciones de gráficas
        
        statusSpan.textContent = '🟢 Conectado';
        card.classList.add('connected');
        card.classList.remove('error');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        logDiv.textContent = 'Conectado exitosamente\nIniciando lectura...';
        showToastAlert('Arduino de sensores conectado correctamente', 'success');
        
        console.log('Sensores conectados - shouldUpdateCharts activado:', shouldUpdateCharts);
        
        setTimeout(() => {
            startReadingSensorData();
        }, 1000);

    } catch (error) {
        console.error('Error conectando sensores:', error);
        connectBtn.disabled = false;
        statusSpan.textContent = '🔴 Error';
        card.classList.add('error');
        card.classList.remove('connected');
        
        // Mantener modo sin sensores en caso de error
        sensorsConnected = false;
        noSensorMode = true;
        shouldUpdateCharts = false;
        
        let errorMessage = 'Error de conexión';
        if (error.message.includes('No port selected')) {
            errorMessage = 'No se seleccionó puerto';
        } else if (error.message.includes('Failed to open')) {
            errorMessage = 'Puerto ocupado o sin permisos';
        } else if (error.message.includes('Timeout')) {
            errorMessage = 'Timeout - verificar dispositivo';
        }
        
        logDiv.textContent = `Error: ${errorMessage}`;
        showToastAlert(`Error conectando sensores: ${errorMessage}`, 'danger');
    }
}

async function connectPumpArduino() {
    const connectBtn = document.getElementById('connectPump');
    const disconnectBtn = document.getElementById('disconnectPump');
    const statusSpan = document.getElementById('pumpStatus');
    const card = document.getElementById('pumpArduino');
    const logDiv = document.getElementById('pumpLog');

    if (!navigator.serial) {
        showToastAlert('Web Serial API no soportada. Usa Chrome/Edge con HTTPS', 'danger');
        return;
    }

    try {
        connectBtn.disabled = true;
        statusSpan.textContent = '🟡 Conectando...';
        logDiv.textContent = 'Solicitando puerto serie para bomba...';

        const filters = [
            { usbVendorId: 0x2341 },
            { usbVendorId: 0x1A86 },
            { usbVendorId: 0x0403 }
        ];

        pumpPort = await navigator.serial.requestPort({ filters });
        
        if (pumpPort.readable) {
            await pumpPort.close();
        }
        
        await pumpPort.open({ 
            baudRate: parseInt(document.getElementById('pumpBaud')?.value || '9600'),
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 255,
            flowControl: 'none'
        });

        pumpConnected = true;
        
        // CRÍTICO: Forzar bomba OFF inmediatamente después de conectar
        await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar que Arduino esté listo
        
        console.log('Forzando bomba OFF al conectar...');
        await sendPumpCommand('OFF'); // Forzar OFF
        
        // Esperar respuesta del Arduino
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // IMPORTANTE: Sincronizar estados
        pumpActive = false;
        realPumpState = false;
        
        statusSpan.textContent = '🟢 Conectado';
        card.classList.add('connected');
        card.classList.remove('error');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        // Actualizar UI para mostrar bomba OFF
        updatePumpDisplay();
        
        logDiv.textContent = 'Conectado exitosamente\nBomba FORZADA a OFF\nBomba lista para control';
        showToastAlert('Arduino de bomba conectado - Bomba apagada por seguridad', 'success');

        // Iniciar lectura de estado del Arduino
        startPumpStatusReader();

    } catch (error) {
        console.error('Error conectando bomba:', error);
        connectBtn.disabled = false;
        statusSpan.textContent = '🔴 Error';
        card.classList.add('error');
        card.classList.remove('connected');
        
        pumpConnected = false;
        pumpActive = false;
        realPumpState = false;
        
        showToastAlert('Error conectando bomba: ' + error.message, 'danger');
    }
}
// NUEVA función para leer estado del Arduino
async function startPumpStatusReader() {
    if (!pumpPort || !pumpConnected) return;
    
    try {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = pumpPort.readable.pipeTo(textDecoder.writable);
        pumpReader = textDecoder.readable.getReader();
        
        let buffer = '';
        
        while (pumpConnected) {
            try {
                const { value, done } = await pumpReader.read();
                if (done) break;
                
                buffer += value;
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine) {
                        processPumpResponse(trimmedLine);
                    }
                }
            } catch (error) {
                if (error.name === 'NetworkError' || error.name === 'AbortError') {
                    break;
                } else {
                    console.error('Error leyendo respuesta de bomba:', error);
                    break;
                }
            }
        }
    } catch (error) {
        console.error('Error iniciando lectura de bomba:', error);
    }
}

// NUEVA función para procesar respuestas del Arduino
function processPumpResponse(response) {
    const pumpLog = document.getElementById('pumpLog');
    if (pumpLog) {
        pumpLog.textContent += '\nArduino: ' + response;
        pumpLog.scrollTop = pumpLog.scrollHeight;
    }
    
    // Detectar estado real de la bomba desde las respuestas del Arduino
    if (response.includes('BOMBA ENCENDIDA') || response.includes('✅')) {
        realPumpState = true;
        console.log('Arduino confirma: BOMBA ENCENDIDA');
    } else if (response.includes('BOMBA APAGADA') || response.includes('🛑')) {
        realPumpState = false;
        console.log('Arduino confirma: BOMBA APAGADA');
    }
    
    // Detectar respuestas JSON del estado
    if (response.startsWith('{') && response.includes('pump_active')) {
        try {
            const status = JSON.parse(response);
            realPumpState = status.pump_active;
            console.log('Estado JSON recibido:', realPumpState);
            
            // Solo sincronizar si hay discrepancia
            if (realPumpState !== pumpActive) {
                console.log('Sincronizando estados - Real:', realPumpState, 'Local:', pumpActive);
                pumpActive = realPumpState;
                updatePumpDisplay();
            }
        } catch (e) {
            console.log('Respuesta no JSON:', response);
        }
    }
}

// NUEVAS funciones para botones separados
async function turnOnPump() {
    if (!pumpConnected) {
        showToastAlert('Arduino de bomba no conectado', 'warning');
        return;
    }
    
    if (emergencyStopActive) {
        showToastAlert('Sistema en parada de emergencia', 'danger');
        return;
    }
    
    if (pumpActive) {
        showToastAlert('La bomba ya está encendida', 'info');
        return;
    }
    
    console.log('Encendiendo bomba...');
    const success = await sendPumpCommand('ON');
    
    if (success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        pumpActive = true;
        systemStats.irrigationCount++;
        updatePumpDisplay();
        updatePumpData();
        showToastAlert('Bomba ENCENDIDA', 'success');
    } else {
        showToastAlert('Error encendiendo bomba', 'danger');
    }
}

async function turnOffPump() {
    if (!pumpConnected) {
        showToastAlert('Arduino de bomba no conectado', 'warning');
        return;
    }
    
    if (!pumpActive) {
        showToastAlert('La bomba ya está apagada', 'info');
        return;
    }
    
    console.log('Apagando bomba...');
    const success = await sendPumpCommand('OFF');
    
    if (success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        pumpActive = false;
        updatePumpDisplay();
        updatePumpData();
        showToastAlert('Bomba APAGADA', 'warning');
    } else {
        showToastAlert('Error apagando bomba', 'danger');
    }
}

// ===== FUNCIONES DE DESCONEXIÓN MEJORADAS =====
async function disconnectSensorsArduino() {
    try {
        if (sensorsReader) {
            try {
                await sensorsReader.cancel();
            } catch (e) {
                console.log('Reader ya cerrado');
            }
            sensorsReader = null;
        }
        
        if (sensorsPort) {
            try {
                await sensorsPort.close();
            } catch (e) {
                console.log('Puerto ya cerrado');
            }
            sensorsPort = null;
        }
        
        // IMPORTANTE: Desactivar modo con sensores y pausar actualizaciones
        sensorsConnected = false;
        noSensorMode = true;
        shouldUpdateCharts = false; // DESACTIVAR actualizaciones
        
        updateSensorsUI(false);
        initializeNoSensorDisplay();
        
        console.log('Sensores desconectados - shouldUpdateCharts desactivado:', shouldUpdateCharts);
        showToastAlert('Arduino de sensores desconectado', 'warning');
        
    } catch (error) {
        console.error('Error desconectando sensores:', error);
        sensorsConnected = false;
        noSensorMode = true;
        shouldUpdateCharts = false;
        updateSensorsUI(false);
        initializeNoSensorDisplay();
        showToastAlert('Error al desconectar sensores', 'danger');
    }
}

async function disconnectPumpArduino() {
    try {
        if (pumpReader) {
            try {
                await pumpReader.cancel();
            } catch (e) {
                console.log('Reader ya cerrado');
            }
            pumpReader = null;
        }
        
        if (pumpPort) {
            try {
                await pumpPort.close();
            } catch (e) {
                console.log('Puerto ya cerrado');
            }
            pumpPort = null;
        }
        
        pumpConnected = false;
        pumpActive = false;
        updatePumpUI(false);
        showToastAlert('Arduino de bomba desconectado', 'warning');
        
    } catch (error) {
        console.error('Error desconectando bomba:', error);
        pumpConnected = false;
        pumpActive = false;
        updatePumpUI(false);
        showToastAlert('Error al desconectar bomba', 'danger');
    }
}

// ===== FUNCIONES DE ACTUALIZACIÓN DE UI =====
function updateSensorsUI(connected) {
    const statusSpan = document.getElementById('sensorsStatus');
    const card = document.getElementById('sensorsArduino');
    const connectBtn = document.getElementById('connectSensors');
    const disconnectBtn = document.getElementById('disconnectSensors');
    const logDiv = document.getElementById('sensorsLog');
    
    if (connected) {
        statusSpan.textContent = '🟢 Conectado';
        card.classList.add('connected');
        card.classList.remove('error');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else {
        statusSpan.textContent = '⚪ Desconectado';
        card.classList.remove('connected', 'error');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        logDiv.textContent = 'Arduino de sensores desconectado';
        
        const dataDisplay = document.getElementById('sensorsData');
        if (dataDisplay) {
            dataDisplay.innerHTML = 'Sin datos de sensores';
        }
    }
}

function updatePumpUI(connected) {
    const statusSpan = document.getElementById('pumpStatus');
    const card = document.getElementById('pumpArduino');
    const connectBtn = document.getElementById('connectPump');
    const disconnectBtn = document.getElementById('disconnectPump');
    const logDiv = document.getElementById('pumpLog');
    
    if (connected) {
        statusSpan.textContent = '🟢 Conectado';
        card.classList.add('connected');
        card.classList.remove('error');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    } else {
        statusSpan.textContent = '⚪ Desconectado';
        card.classList.remove('connected', 'error');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        logDiv.textContent = 'Arduino de bomba desconectado';
        updatePumpDisplay();
    }
}

// ===== LECTURA DE DATOS REALES =====
async function startReadingSensorData() {
    if (!sensorsPort || !sensorsConnected) {
        showToastAlert('Puerto de sensores no disponible', 'warning');
        return;
    }
    
    try {
        console.log('Iniciando lectura de datos de sensores...');
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = sensorsPort.readable.pipeTo(textDecoder.writable);
        sensorsReader = textDecoder.readable.getReader();
        
        let buffer = '';
        
        while (sensorsConnected && !emergencyStopActive) {
            try {
                const { value, done } = await sensorsReader.read();
                
                if (done) {
                    console.log('Lectura de sensores terminada');
                    break;
                }
                
                buffer += value;
                
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine) {
                        processSensorData(trimmedLine);
                    }
                }
                
            } catch (error) {
                if (error.name === 'NetworkError' || error.name === 'AbortError') {
                    console.log('Lectura interrumpida:', error.name);
                    break;
                } else {
                    console.error('Error leyendo datos:', error);
                    showToastAlert('Error en lectura de datos', 'warning');
                    break;
                }
            }
        }
        
    } catch (error) {
        console.error('Error iniciando lectura:', error);
        showToastAlert('Error al iniciar lectura de sensores', 'danger');
    }
}

// ===== PROCESAMIENTO DE DATOS MEJORADO =====
// Busca tu función processSensorData y reemplázala COMPLETAMENTE por:
// ===== CORRECCIÓN ESPECÍFICA PARA HUMEDAD DEL AIRE =====

// BUSCA esta línea en tu función processSensorData() (alrededor de la línea 1200-1300):
// updateSensorCardsImproved(gasValue, ultrasonicValue, soilValue, tempValue, humidValue);

// Y REEMPLÁZALA por:
// updateSensorCardsStable();

// Si no encuentras esa línea, busca en processSensorData() la sección donde dice:
// "// Actualizar UI con valores estables"

// Y asegúrate de que diga EXACTAMENTE esto:
// ===== FUNCIÓN CRÍTICA CORREGIDA: processSensorData =====
// Esta función procesa los datos que llegan del Arduino - REEMPLAZA la que tienes
function processSensorData(data) {
    try {
        const trimmedData = data.trim();
        console.log('Dato recibido del Arduino:', trimmedData);
        
        // Actualizar log de sensores
        const sensorsLog = document.getElementById('sensorsLog');
        if (sensorsLog) {
            sensorsLog.textContent += '\n' + trimmedData;
            sensorsLog.scrollTop = sensorsLog.scrollHeight;
        }
        
        // Verificar si es JSON válido
        if (trimmedData.startsWith('{') && trimmedData.endsWith('}')) {
            try {
                const jsonData = JSON.parse(trimmedData);
                console.log('JSON parseado correctamente:', jsonData);
                
                // Extraer valores del JSON - AQUÍ ESTÁ EL PROBLEMA DE LA HUMEDAD
                const gasValue = parseFloat(jsonData.gas) || 0;
                const ultrasonicValue = parseFloat(jsonData.ultrasonic) || 0;
                const soilValue = parseFloat(jsonData.soil) || 0;
                const tempValue = parseFloat(jsonData.temperature) || 0;
                const humidValue = parseFloat(jsonData.humidity) || 0; // IMPORTANTE: También capturar humedad
                
                console.log('=== VALORES EXTRAÍDOS DEL ARDUINO ===');
                console.log('Gas:', gasValue, 'Ultrasonic:', ultrasonicValue, 'Soil:', soilValue);
                console.log('Temperature:', tempValue, 'Humidity:', humidValue); // VERIFICAR QUE LLEGUE
                
                // Detectar cambios significativos
                const now = Date.now();
                const significantChange = 
                    Math.abs(gasValue - stableSensorValues.gas) > 5 ||
                    Math.abs(ultrasonicValue - stableSensorValues.ultrasonic) > 2 ||
                    Math.abs(soilValue - stableSensorValues.soil) > 3 ||
                    Math.abs(tempValue - stableSensorValues.temperature) > 1 ||
                    Math.abs(humidValue - stableSensorValues.humidity) > 3; // INCLUIR HUMEDAD EN DETECCIÓN
                
                console.log('Cambio significativo detectado:', significantChange);
                console.log('Tiempo desde última actualización:', now - stableSensorValues.lastUpdate, 'ms');
                
                // Actualizar si es tiempo o hay cambio significativo
                if ((now - stableSensorValues.lastUpdate > UPDATE_INTERVAL) || significantChange) {
                    console.log('=== ACTUALIZANDO VALORES ESTABLES ===');
                    console.log('Valores anteriores:', JSON.stringify(stableSensorValues));
                    
                    // CRÍTICO: Actualizar TODOS los valores estables incluyendo HUMIDITY
                    stableSensorValues.gas = gasValue;
                    stableSensorValues.ultrasonic = ultrasonicValue;
                    stableSensorValues.soil = soilValue;
                    stableSensorValues.temperature = tempValue;
                    stableSensorValues.humidity = humidValue; // <<<< ESTE ERA EL PROBLEMA PRINCIPAL
                    stableSensorValues.lastUpdate = now;
                    
                    console.log('Valores nuevos actualizados:', JSON.stringify(stableSensorValues));
                    
                    lastDataReceived = now;
                    lastRealUpdate = now;
                    
                    // Solo agregar a arrays si hay sensores conectados
                    if (sensorsConnected && !noSensorMode) {
                        const timestamp = new Date().toLocaleTimeString();
                        
                        sensorData.gas.push(gasValue);
                        sensorData.ultrasonic.push(ultrasonicValue);
                        sensorData.soil.push(soilValue);
                        sensorData.temperature.push(tempValue);
                        sensorData.humidity.push(humidValue); // TAMBIÉN AGREGAR AL ARRAY
                        sensorData.timestamps.push(timestamp);
                        
                        // Mantener últimos 20 valores
                        const maxValues = 20;
                        Object.keys(sensorData).forEach(key => {
                            if (sensorData[key].length > maxValues) {
                                sensorData[key].shift();
                            }
                        });
                        
                        systemStats.totalReadings++;
                        console.log('Datos agregados a arrays. Total readings:', systemStats.totalReadings);
                    }
                    
                    // CRÍTICO: Usar la función CORRECTA para actualizar UI
                    console.log('Llamando a updateSensorCardsStable()...');
                    updateSensorCardsStable(); // <<<< FUNCIÓN CLAVE PARA MOSTRAR HUMEDAD
                    
                    // Actualizar gráficas solo si está habilitado
                    if (shouldUpdateCharts && sensorsConnected && !noSensorMode) {
                        console.log('Actualizando gráficas...');
                        updateCharts();
                    }
                    
                    // Actualizar estadísticas
                    updateStatistics();
                    
                    // Verificar riego automático
                    if (autoModeActive && !emergencyStopActive) {
                        checkAutoIrrigation(soilValue);
                    }
                    
                    // Actualizar display de datos
                    updateSensorDataDisplayStable();
                    
                } else {
                    console.log('Manteniendo valores estables (sin cambio significativo)');
                    
                    // Forzar actualización de display sin cambiar valores
                    forceUpdateDisplayOnly();
                }
                
            } catch (parseError) {
                console.error('Error parseando JSON del Arduino:', parseError);
                console.log('Datos problemáticos:', trimmedData);
            }
        } else {
            // Si no es JSON, mostrar en log
            console.log('Datos no JSON recibidos:', trimmedData);
        }
        
    } catch (error) {
        console.error('Error general procesando datos del sensor:', error);
        console.log('Datos que causaron error:', data);
    }
}

// ===== FUNCIÓN AUXILIAR PARA FORZAR ACTUALIZACIÓN DE DISPLAY =====
function forceUpdateDisplayOnly() {
    console.log('Forzando actualización de display...');
    
    // Verificar específicamente la humedad del aire
    const humidEl = document.getElementById('humidValue');
    const humidStatusEl = document.getElementById('humidStatus');
    
    if (humidEl && stableSensorValues.humidity > 0) {
        const currentValue = stableSensorValues.humidity.toFixed(1) + '%';
        if (humidEl.textContent !== currentValue) {
            console.log('CORRIGIENDO display humedad:', humidEl.textContent, '->', currentValue);
            humidEl.textContent = currentValue;
        }
    }
    
    // También verificar otros sensores
    const gasEl = document.getElementById('gasValue');
    if (gasEl && stableSensorValues.gas > 0) {
        const currentValue = stableSensorValues.gas.toFixed(1);
        if (gasEl.textContent !== currentValue) {
            console.log('Corrigiendo display gas:', gasEl.textContent, '->', currentValue);
            gasEl.textContent = currentValue;
        }
    }
    
    const soilEl = document.getElementById('soilValue');
    if (soilEl && stableSensorValues.soil > 0) {
        const currentValue = stableSensorValues.soil.toFixed(1) + '%';
        if (soilEl.textContent !== currentValue) {
            console.log('Corrigiendo display soil:', soilEl.textContent, '->', currentValue);
            soilEl.textContent = currentValue;
        }
    }
    
    const tempEl = document.getElementById('tempValue');
    if (tempEl && stableSensorValues.temperature > 0) {
        const currentValue = stableSensorValues.temperature.toFixed(1) + '°C';
        if (tempEl.textContent !== currentValue) {
            console.log('Corrigiendo display temperatura:', tempEl.textContent, '->', currentValue);
            tempEl.textContent = currentValue;
        }
    }
    
    const ultraEl = document.getElementById('ultrasonicValue');
    if (ultraEl && stableSensorValues.ultrasonic > 0) {
        const currentValue = stableSensorValues.ultrasonic.toFixed(1) + ' cm';
        if (ultraEl.textContent !== currentValue) {
            console.log('Corrigiendo display ultrasonic:', ultraEl.textContent, '->', currentValue);
            ultraEl.textContent = currentValue;
        }
    }
}

// ===== FUNCIÓN DE MONITOREO CONTINUO =====
function startSensorDisplayMonitor() {
    console.log('Iniciando monitor de display de sensores...');
    
    setInterval(() => {
        if (sensorsConnected && !noSensorMode) {
            // Monitorear específicamente la humedad del aire
            const humidEl = document.getElementById('humidValue');
            if (humidEl && stableSensorValues.humidity > 0) {
                const expectedValue = stableSensorValues.humidity.toFixed(1) + '%';
                if (humidEl.textContent !== expectedValue) {
                    console.log('MONITOR: Corrigiendo humedad display:', humidEl.textContent, '->', expectedValue);
                    humidEl.textContent = expectedValue;
                }
            }
            
            // Verificar estado de humedad
            const humidStatusEl = document.getElementById('humidStatus');
            if (humidStatusEl && stableSensorValues.humidity > 0) {
                const humidStatus = getHumidityStatus(stableSensorValues.humidity);
                const expectedStatus = `${humidStatus.icon || ''} ${humidStatus.message}`;
                if (humidStatusEl.textContent !== expectedStatus) {
                    console.log('MONITOR: Corrigiendo status humedad:', humidStatusEl.textContent, '->', expectedStatus);
                    humidStatusEl.textContent = expectedStatus;
                }
            }
        }
    }, 2000); // Cada 2 segundos
}

// ===== FUNCIÓN DE DEBUG PARA VERIFICAR VALORES =====
function debugSensorValues() {
    console.log('=== DEBUG VALORES DE SENSORES ===');
    console.log('stableSensorValues:', stableSensorValues);
    console.log('sensorData lengths:', {
        gas: sensorData.gas.length,
        ultrasonic: sensorData.ultrasonic.length,
        soil: sensorData.soil.length,
        temperature: sensorData.temperature.length,
        humidity: sensorData.humidity.length,
        timestamps: sensorData.timestamps.length
    });
    
    // Verificar elementos del DOM
    const elements = ['gasValue', 'ultrasonicValue', 'soilValue', 'tempValue', 'humidValue'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        console.log(`${id}:`, el ? el.textContent : 'NO ENCONTRADO');
    });
    
    // Verificar alertStats para la gráfica
    console.log('alertStats:', alertStats);
    console.log('chartsInitialized:', chartsInitialized);
    console.log('shouldUpdateCharts:', shouldUpdateCharts);
}

// Hacer disponible globalmente para debugging
window.debugSensorValues = debugSensorValues;
window.forceUpdateDisplayOnly = forceUpdateDisplayOnly;

console.log('=== FUNCIÓN processSensorData CORREGIDA CARGADA ===');
console.log('Problemas solucionados:');
console.log('1. Humedad del aire se actualiza correctamente en stableSensorValues.humidity');
console.log('2. Se agrega humedad al array sensorData.humidity');
console.log('3. Sistema de monitoreo continuo activado');
console.log('4. Debug functions disponibles: debugSensorValues(), forceUpdateDisplayOnly()');
console.log('====================================================');
// LLAMAR esta función en tu initializeSystem()
// Busca la función initializeSystem() y agrega esta línea al final:
// startSensorDisplayMonitor();

// NUEVA función para actualizar tarjetas sin parpadeo
function updateSensorCardsStable() {
    const gas = stableSensorValues.gas;
    const ultrasonic = stableSensorValues.ultrasonic;
    const soil = stableSensorValues.soil;
    const temp = stableSensorValues.temperature;
    const humid = stableSensorValues.humidity;
    
    console.log('Actualizando UI con valores estables:', { gas, ultrasonic, soil, temp, humid });
    
    // Usar tus funciones de evaluación existentes
    const gasStatus = evaluateGasLevel(gas);
    const ultraStatus = evaluateUltrasonicLevel(ultrasonic);
    const soilStatus = getSoilStatus(soil);
    const tempStatus = getTemperatureStatus(temp);
    const humidStatus = getHumidityStatus(humid);
    
    // Actualizar sin parpadeo
    updateCardStable('gasCard', 'gasValue', 'gasStatus', gas.toFixed(1), '', gasStatus);
    updateCardStable('ultrasonicCard', 'ultrasonicValue', 'ultrasonicStatus', ultrasonic.toFixed(1), ' cm', ultraStatus);
    updateCardStable('soilCard', 'soilValue', 'soilStatus', soil.toFixed(1), '%', soilStatus);
    updateCardStable('tempCard', 'tempValue', 'tempStatus', temp.toFixed(1), '°C', tempStatus);
    updateCardStable('humidCard', 'humidValue', 'humidStatus', humid.toFixed(1), '%', humidStatus);
}

// ===== CORRECCIÓN PARA GRÁFICA DE ALERTAS =====

// PROBLEMA: La función updateCardStable() no actualiza las estadísticas
// BUSCA tu función updateCardStable() y REEMPLÁZALA completamente por esta versión:

function updateCardStable(cardId, valueId, statusId, value, unit, evaluation) {
    const card = document.getElementById(cardId);
    const valueEl = document.getElementById(valueId);
    const statusEl = document.getElementById(statusId);
    
    if (card) {
        const newClass = `status-card ${evaluation.level}`;
        if (card.className !== newClass) {
            card.className = newClass;
        }
    }
    
    if (valueEl) {
        const newValue = value + unit;
        if (valueEl.textContent !== newValue) {
            valueEl.textContent = newValue;
        }
    }
    
    if (statusEl) {
        const newStatus = `${evaluation.icon || ''} ${evaluation.message}`;
        if (statusEl.textContent !== newStatus) {
            statusEl.textContent = newStatus;
        }
    }
    
    // CRÍTICO: Actualizar estadísticas para la gráfica de alertas
    // Solo actualizar estadísticas para valores reales con sensores conectados
    if (!noSensorMode && sensorsConnected && parseFloat(value) > 0) {
        // INCREMENTAR contadores según el nivel de evaluación
        switch(evaluation.level) {
            case 'normal': 
                alertStats.bueno++; 
                console.log('Incrementando bueno:', alertStats.bueno);
                break;
            case 'warning': 
                alertStats.regular++; 
                console.log('Incrementando regular:', alertStats.regular);
                break;
            case 'danger': 
                alertStats.malo++; 
                console.log('Incrementando malo:', alertStats.malo);
                break;
            case 'critical': 
                alertStats.peligroso++; 
                console.log('Incrementando peligroso:', alertStats.peligroso);
                break;
        }
        
        // FORZAR actualización de gráfica de alertas inmediatamente
        updateAlertsChartForced();
    }
    
    // Solo mostrar alertas con cooldown si es necesario
    if (evaluation.shouldAlert && sensorsConnected && !noSensorMode && parseFloat(value) > 0) {
        const sensorName = cardId.replace('Card', '');
        const now = Date.now();
        
        if (!lastAlertTime[sensorName] || (now - lastAlertTime[sensorName] > ALERT_COOLDOWN)) {
            const sensorDisplayNames = {
                'gas': 'Gas',
                'ultrasonic': 'Nivel de Tanque',  
                'soil': 'Humedad del Suelo',
                'temp': 'Temperatura',
                'humid': 'Humedad del Aire'
            };
            
            const alertMessage = `${sensorDisplayNames[sensorName]}: ${evaluation.message}`;
            showToastAlert(alertMessage, evaluation.alertType, sensorName);
            lastAlertTime[sensorName] = now;
        }
    }
}

// NUEVA función para forzar actualización de gráfica de alertas
function updateAlertsChartForced() {
    if (charts.alerts && chartsInitialized) {
        const totalAlerts = alertStats.bueno + alertStats.regular + alertStats.malo + alertStats.peligroso;
        
        console.log('Actualizando gráfica de alertas - Total:', totalAlerts);
        console.log('Distribución:', alertStats);
        
        if (totalAlerts > 0) {
            charts.alerts.data.datasets[0].data = [
                alertStats.bueno,
                alertStats.regular,
                alertStats.malo,
                alertStats.peligroso
            ];
            charts.alerts.update('none');
            console.log('Gráfica de alertas actualizada con datos:', charts.alerts.data.datasets[0].data);
        } else {
            // Si no hay alertas, mostrar al menos un valor para que se vea la gráfica
            charts.alerts.data.datasets[0].data = [1, 0, 0, 0]; // Mostrar "1" en bueno por defecto
            charts.alerts.update('none');
            console.log('Gráfica de alertas actualizada con valores por defecto');
        }
    } else {
        console.log('Gráfica de alertas no disponible');
    }
}

// FUNCIÓN DE RESETEO para estadísticas (para debugging)
function resetAlertStats() {
    alertStats = {
        bueno: 0,
        regular: 0,
        malo: 0,
        peligroso: 0
    };
    console.log('Estadísticas de alertas reseteadas');
    updateAlertsChartForced();
}

// FUNCIÓN DE TEST para verificar gráfica de alertas
function testAlertsChart() {
    console.log('=== TEST GRÁFICA DE ALERTAS ===');
    console.log('Charts initialized:', chartsInitialized);
    console.log('Charts.alerts exists:', !!charts.alerts);
    console.log('Current alertStats:', alertStats);
    
    // Datos de prueba
    alertStats.bueno = 5;
    alertStats.regular = 3;
    alertStats.malo = 2;
    alertStats.peligroso = 1;
    
    console.log('Aplicando datos de prueba:', alertStats);
    updateAlertsChartForced();
}

// HACER FUNCIONES DISPONIBLES GLOBALMENTE para debugging
window.resetAlertStats = resetAlertStats;
window.testAlertsChart = testAlertsChart;
window.updateAlertsChartForced = updateAlertsChartForced;

// NUEVA función para display estable
function updateSensorDataDisplayStable() {
    const dataDisplay = document.getElementById('sensorsData');
    if (dataDisplay && sensorsConnected && !noSensorMode) {
        const timestamp = new Date().toLocaleTimeString();
        
        const displayText = `Gas: ${stableSensorValues.gas.toFixed(1)}
Ultrasonido: ${stableSensorValues.ultrasonic.toFixed(1)} cm
Suelo: ${stableSensorValues.soil.toFixed(1)}%
Temperatura: ${stableSensorValues.temperature.toFixed(1)}°C
Humedad: ${stableSensorValues.humidity.toFixed(1)}%
Última actualización: ${timestamp}`;
        
        if (dataDisplay.innerHTML !== displayText) {
            dataDisplay.innerHTML = displayText;
        }
    }
}
// ===== ACTUALIZACIÓN DE TARJETAS MEJORADA =====
function updateSensorCardsImproved(gas, ultrasonic, soil, temp, humid) {
    // Evaluar gas con nuevos parámetros
    const gasStatus = evaluateGasLevel(gas);
    updateCardImproved('gasCard', 'gasValue', 'gasStatus', gas.toFixed(1), '', gasStatus);
    
    // Evaluar ultrasonido con nuevos parámetros
    const ultraStatus = evaluateUltrasonicLevel(ultrasonic);
    updateCardImproved('ultrasonicCard', 'ultrasonicValue', 'ultrasonicStatus', ultrasonic.toFixed(1), ' cm', ultraStatus);
    
    // Evaluar suelo
    const soilStatus = getSoilStatus(soil);
    updateCardImproved('soilCard', 'soilValue', 'soilStatus', soil.toFixed(1), '%', soilStatus);
    
    // Evaluar temperatura
    const tempStatus = getTemperatureStatus(temp);
    updateCardImproved('tempCard', 'tempValue', 'tempStatus', temp.toFixed(1), '°C', tempStatus);
    
    // Evaluar humedad
    const humidStatus = getHumidityStatus(humid);
    updateCardImproved('humidCard', 'humidValue', 'humidStatus', humid.toFixed(1), '%', humidStatus);
}

function updateCardImproved(cardId, valueId, statusId, value, unit, evaluation) {
    const card = document.getElementById(cardId);
    const valueEl = document.getElementById(valueId);
    const statusEl = document.getElementById(statusId);
    
    if (card) card.className = `status-card ${evaluation.level}`;
    if (valueEl) valueEl.textContent = value + unit;
    if (statusEl) statusEl.textContent = `${evaluation.icon || ''} ${evaluation.message}`;
    
    // IMPORTANTE: Solo mostrar alertas si hay sensores conectados y no estamos en modo sin sensores
    // Y solo si el valor es mayor que 0 (dato real)
    if (evaluation.shouldAlert && sensorsConnected && !noSensorMode && parseFloat(value) > 0) {
        const sensorName = cardId.replace('Card', '');
        const sensorDisplayNames = {
            'gas': 'Gas',
            'ultrasonic': 'Nivel de Tanque',
            'soil': 'Humedad del Suelo',
            'temp': 'Temperatura',
            'humid': 'Humedad del Aire'
        };
        
        const alertMessage = `${sensorDisplayNames[sensorName]}: ${evaluation.message}`;
        showToastAlert(alertMessage, evaluation.alertType, sensorName);
    }
    
    // Actualizar estadísticas solo para condiciones reales con sensores conectados
    if (!noSensorMode && sensorsConnected && parseFloat(value) > 0) {
        switch(evaluation.level) {
            case 'normal': alertStats.bueno++; break;
            case 'warning': alertStats.regular++; break;
            case 'danger': alertStats.malo++; break;
            case 'critical': alertStats.peligroso++; break;
        }
    }
}

// ===== ENVÍO DE COMANDOS A LA BOMBA =====
async function sendPumpCommand(command) {
    if (!pumpPort || !pumpConnected) {
        showToastAlert('Arduino de bomba no conectado', 'warning');
        return false;
    }
    
    try {
        const writer = pumpPort.writable.getWriter();
        const encoder = new TextEncoder();
        
        await writer.write(encoder.encode(command + '\n'));
        writer.releaseLock();
        
        const pumpLog = document.getElementById('pumpLog');
        if (pumpLog) {
            pumpLog.textContent += `\nComando: ${command}`;
            pumpLog.scrollTop = pumpLog.scrollHeight;
        }
        
        return true;
    } catch (error) {
        console.error('Error enviando comando:', error);
        showToastAlert('Error enviando comando a la bomba', 'danger');
        return false;
    }
}

// ===== CONTROL DE BOMBA CORREGIDO =====
async function togglePump() {
    if (!pumpConnected) {
        showToastAlert('Arduino de bomba no conectado', 'warning');
        return;
    }
    
    if (emergencyStopActive) {
        showToastAlert('Sistema en parada de emergencia', 'danger');
        return;
    }
    
    // Determinar comando basado en estado ACTUAL
    const targetState = !pumpActive;
    const command = targetState ? 'ON' : 'OFF';
    
    console.log(`Enviando comando: ${command} (estado actual: ${pumpActive} -> ${targetState})`);
    
    const success = await sendPumpCommand(command);
    
    if (success) {
        // Esperar confirmación del Arduino
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Solo cambiar estado si comando fue exitoso
        pumpActive = targetState;
        updatePumpDisplay();
        
        if (pumpActive) {
            systemStats.irrigationCount++;
            showToastAlert('Bomba ENCENDIDA', 'success');
        } else {
            showToastAlert('Bomba APAGADA', 'warning');
        }
        
        updatePumpData();
    } else {
        showToastAlert('Error enviando comando a la bomba', 'danger');
    }
}

function updatePumpDisplay() {
    const pumpBtn = document.getElementById('pumpBtn');
    const pumpState = document.getElementById('pumpState');
    const onBtn = document.getElementById('pumpOnBtn');
    const offBtn = document.getElementById('pumpOffBtn');
    
    // Botón principal toggle
    if (pumpBtn) {
        if (pumpActive) {
            pumpBtn.textContent = '🟢 BOMBA ACTIVA - Click para Apagar';
            pumpBtn.className = 'btn pump-btn btn-danger';
        } else {
            pumpBtn.textContent = '🔴 BOMBA INACTIVA - Click para Encender';
            pumpBtn.className = 'btn pump-btn';
        }
    }
    
    // Estado
    if (pumpState) {
        pumpState.textContent = pumpActive ? 'ACTIVA 🟢' : 'INACTIVA 🔴';
    }
    
    // Botones separados (si existen)
    if (onBtn) {
        onBtn.disabled = pumpActive || !pumpConnected || emergencyStopActive;
        onBtn.textContent = pumpActive ? '✅ Bomba Encendida' : '🔴 Encender Bomba';
    }
    
    if (offBtn) {
        offBtn.disabled = !pumpActive || !pumpConnected;
        offBtn.textContent = !pumpActive ? '✅ Bomba Apagada' : '🟢 Apagar Bomba';
    }
}
// NUEVA función para actualizar datos de bomba
function updatePumpData() {
    const pumpData = document.getElementById('pumpData');
    if (pumpData) {
        pumpData.innerHTML = `Estado: ${pumpActive ? 'ACTIVA 🟢' : 'INACTIVA 🔴'}
Modo: ${autoModeActive ? 'Automático' : 'Manual'}
Estado real Arduino: ${realPumpState ? 'ON' : 'OFF'}
Riegos totales: ${systemStats.irrigationCount}
Última acción: ${new Date().toLocaleTimeString()}`;
    }
}

async function autoMode() {
    autoModeActive = true;
    const statusEl = document.getElementById('autoModeStatus');
    if (statusEl) {
        statusEl.textContent = 'Modo: Automático';
        statusEl.style.color = '#4CAF50';
    }
    
    await sendPumpCommand('AUTO_MODE_ON');
    showToastAlert('Modo automático activado', 'success');
}

async function manualMode() {
    autoModeActive = false;
    const statusEl = document.getElementById('autoModeStatus');
    if (statusEl) {
        statusEl.textContent = 'Modo: Manual';
        statusEl.style.color = '#ff9800';
    }
    
    await sendPumpCommand('AUTO_MODE_OFF');
    showToastAlert('Modo manual activado', 'warning');
}

async function checkAutoIrrigation(soilValue) {
    if (soilValue < plantParameters.soilMin && !pumpActive) {
        await togglePump();
        showToastAlert('Riego automático activado - Suelo seco detectado', 'success', 'soil');
    } else if (soilValue > plantParameters.soilMax && pumpActive) {
        await togglePump();
        showToastAlert('Riego automático desactivado - Suelo saturado', 'warning', 'soil');
    }
}

// ===== ESTADÍSTICAS MEJORADAS =====
function updateStatistics() {
    const updateElement = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    
    updateElement('totalReadings', systemStats.totalReadings);
    updateElement('alertCount', systemStats.alertCount);
    updateElement('irrigationCount', systemStats.irrigationCount);
    updateElement('uptime', getSystemUptime());
    updateElement('systemUptime', getSystemUptime());
    
    // Actualizar estadísticas adicionales
    updateElement('gasGoodCount', alertStats.bueno);
    updateElement('gasRegularCount', alertStats.regular);
    updateElement('gasBadCount', alertStats.malo);
    updateElement('gasDangerCount', alertStats.peligroso);
}

function getSystemUptime() {
    const now = Date.now();
    const uptime = now - systemStats.startTime;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function startTimeUpdater() {
    setInterval(() => {
        updateStatistics();
    }, 1000);
}



// ===== GLOSARIO COMPLETO DE PLANTAS DE ECUADOR =====
// ===== GLOSARIO COMPLETO DE PLANTAS DE ECUADOR =====
const plantasEcuador = {
    // === FRUTAS TROPICALES ===
    mango: {
        nombre: "Mango",
        regiones: {
            costa: { soilOptimal: 45, soilMin: 30, soilMax: 65, tempOptimal: 28, humidOptimal: 70, descripcion: "Clima cálido y húmedo" },
            sierra: { soilOptimal: 50, soilMin: 35, soilMax: 70, tempOptimal: 25, humidOptimal: 65, descripcion: "Valles temperados" },
            oriente: { soilOptimal: 40, soilMin: 25, soilMax: 60, tempOptimal: 30, humidOptimal: 75, descripcion: "Alta humedad tropical" }
        },
        notas: "Rico en vitamina C, prefiere suelos bien drenados"
    },
    
    banano: {
        nombre: "Banano",
        regiones: {
            costa: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 27, humidOptimal: 75, descripcion: "Principal zona productora" },
            sierra: { soilOptimal: 70, soilMin: 55, soilMax: 85, tempOptimal: 22, humidOptimal: 70, descripcion: "Cultivo limitado en valles" },
            oriente: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 29, humidOptimal: 80, descripcion: "Excelente para banano orgánico" }
        },
        notas: "Requiere mucha agua y temperaturas estables"
    },

    cacao: {
        nombre: "Cacao",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 26, humidOptimal: 75, descripcion: "Cacao fino de aroma" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 23, humidOptimal: 70, descripcion: "Valles subtropicales" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 28, humidOptimal: 80, descripcion: "Cacao amazónico tradicional" }
        },
        notas: "Necesita sombra parcial y suelos ricos en materia orgánica"
    },

    platano: {
        nombre: "Plátano",
        regiones: {
            costa: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 27, humidOptimal: 75, descripcion: "Zona productora por excelencia" },
            sierra: { soilOptimal: 70, soilMin: 55, soilMax: 85, tempOptimal: 21, humidOptimal: 65, descripcion: "Solo en valles cálidos" },
            oriente: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 28, humidOptimal: 80, descripcion: "Buena producción orgánica" }
        },
        notas: "Similar al banano, pero con mayor diversidad de usos culinarios"
    },

    maracuya: {
        nombre: "Maracuyá",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 27, humidOptimal: 70, descripcion: "Fruta de exportación" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 20, humidOptimal: 65, descripcion: "En valles interandinos cálidos" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 28, humidOptimal: 80, descripcion: "Abundancia en zonas amazónicas" }
        },
        notas: "Necesita tutoreo, floración continua y buen drenaje"
    },

    // === CÍTRICOS ===
    naranja: {
        nombre: "Naranja",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 26, humidOptimal: 65, descripcion: "Zonas bajas costeras" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 20, humidOptimal: 60, descripcion: "Valles templados" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 27, humidOptimal: 75, descripcion: "Clima húmedo amazónico" }
        },
        notas: "Fuente de vitamina C, requiere riego regular"
    },

    limon: {
        nombre: "Limón",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 27, humidOptimal: 70, descripcion: "Cultivado extensamente en Manabí y Los Ríos" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 19, humidOptimal: 60, descripcion: "Producción en valles cálidos interandinos" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 28, humidOptimal: 75, descripcion: "Zonas amazónicas húmedas" }
        },
        notas: "Muy resistente, ciclos productivos continuos"
    },

    // === FRUTAS DE LA SIERRA ===
    fresa: {
        nombre: "Fresa",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 20, humidOptimal: 60, descripcion: "En zonas altas costeras" },
            sierra: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 16, humidOptimal: 55, descripcion: "Zona principal de cultivo" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 18, humidOptimal: 65, descripcion: "Microclimas frescos amazónicos" }
        },
        notas: "Requiere suelos ricos en materia orgánica y buen riego"
    },

    mora: {
        nombre: "Mora",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 19, humidOptimal: 65, descripcion: "En zonas frescas de la costa" },
            sierra: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 15, humidOptimal: 60, descripcion: "Cultivo predominante" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 18, humidOptimal: 70, descripcion: "Microclimas húmedos frescos" }
        },
        notas: "Muy productiva, utilizada para jugos y mermeladas"
    },

    // === HORTALIZAS ===
    tomate: {
        nombre: "Tomate",
        regiones: {
            costa: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 24, humidOptimal: 65, descripcion: "Tomate industrial" },
            sierra: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 21, humidOptimal: 60, descripcion: "Tomate riñón de mesa" },
            oriente: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 26, humidOptimal: 70, descripcion: "Tomate cherry amazónico" }
        },
        notas: "Rico en licopeno, requiere tutoreo y podas"
    },

    lechuga: {
        nombre: "Lechuga",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 20, humidOptimal: 65, descripcion: "Cultivo de ciclo corto" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 16, humidOptimal: 60, descripcion: "Zona principal de producción" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 21, humidOptimal: 70, descripcion: "Condiciones húmedas" }
        },
        notas: "Requiere riego constante y sombra ligera"
    },

    // === TUBÉRCULOS ===
    papa: {
        nombre: "Papa",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 16, humidOptimal: 60, descripcion: "Papas tempranas en zonas altas" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 14, humidOptimal: 55, descripcion: "Zona principal - múltiples variedades" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 18, humidOptimal: 65, descripcion: "Estribaciones orientales" }
        },
        notas: "Alimento básico, más de 400 variedades nativas"
    },

    // === AROMÁTICAS ===
    albahaca: {
        nombre: "Albahaca",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 25, humidOptimal: 65, descripcion: "Herbácea muy cultivada" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 20, humidOptimal: 60, descripcion: "Valles templados" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 26, humidOptimal: 70, descripcion: "Buena adaptación" }
        },
        notas: "Hierba aromática usada en gastronomía y medicina"
    },

    oregano: {
        nombre: "Orégano",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 24, humidOptimal: 60, descripcion: "Climas secos costeros" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 18, humidOptimal: 55, descripcion: "Valles interandinos" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 22, humidOptimal: 65, descripcion: "Microclimas amazónicos" }
        },
        notas: "Planta aromática perenne, medicinal y culinaria"
    },

    // === MEDICINALES ===
    hierbabuena: {
        nombre: "Hierba Buena",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 24, humidOptimal: 65, descripcion: "Cultivada en huertos familiares" },
            sierra: { soilOptimal: 60, soilMin: 45, soilMax: 75, tempOptimal: 18, humidOptimal: 60, descripcion: "Común en valles interandinos" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 22, humidOptimal: 70, descripcion: "Buena adaptación a zonas húmedas" }
        },
        notas: "Usada como planta medicinal y aromática"
    },

    // === ORNAMENTALES ===
    rosa: {
        nombre: "Rosa",
        regiones: {
            costa: { soilOptimal: 55, soilMin: 40, soilMax: 70, tempOptimal: 22, humidOptimal: 65, descripcion: "Producción limitada" },
            sierra: { soilOptimal: 65, soilMin: 50, soilMax: 80, tempOptimal: 16, humidOptimal: 60, descripcion: "Zona principal de exportación de rosas" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 20, humidOptimal: 70, descripcion: "Producción artesanal" }
        },
        notas: "Flor de exportación, Ecuador es líder mundial"
    },

    // === CACTÁCEAS ===
    cactus: {
        nombre: "Cactus",
        regiones: {
            costa: { soilOptimal: 40, soilMin: 25, soilMax: 55, tempOptimal: 28, humidOptimal: 40, descripcion: "Climas áridos costeros" },
            sierra: { soilOptimal: 45, soilMin: 30, soilMax: 60, tempOptimal: 18, humidOptimal: 45, descripcion: "Altiplano seco" },
            oriente: { soilOptimal: 50, soilMin: 35, soilMax: 65, tempOptimal: 24, humidOptimal: 60, descripcion: "Adaptación en suelos pedregosos amazónicos" }
        },
        notas: "Gran variedad de especies nativas, adaptadas a sequía"
    }

};


// ===== FUNCIONES DE PLANTAS DE ECUADOR =====
function selectPlantEcuador() {
    const plantSelect = document.getElementById('plantSelect');
    const regionSelect = document.getElementById('regionSelect');
    const customInput = document.getElementById('customPlantInput');
    
    if (!plantSelect || !regionSelect) return;
    
    const selectedPlant = plantSelect.value;
    const selectedRegion = regionSelect.value || 'costa';
    
    if (selectedPlant === 'custom') {
        if (customInput) customInput.style.display = 'block';
        return;
    }
    
    if (customInput) customInput.style.display = 'none';
    
    if (selectedPlant && plantasEcuador[selectedPlant]) {
        const plantData = plantasEcuador[selectedPlant];
        const regionData = plantData.regiones[selectedRegion];
        
        // Aplicar parámetros de la región seleccionada
        Object.assign(plantParameters, regionData);
        
        // Actualizar inputs si existen
        const inputs = ['soilOptimal', 'soilMin', 'soilMax', 'tempOptimal', 'humidOptimal'];
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input && regionData[id] !== undefined) {
                input.value = regionData[id];
            }
        });
        
        // Mostrar información detallada de la planta
        updatePlantInfoDisplay(plantData, regionData, selectedRegion);
        
        const plantName = plantData.nombre;
        const regionName = selectedRegion.charAt(0).toUpperCase() + selectedRegion.slice(1);
        
        showToastAlert(`${plantName} configurada para región ${regionName}`, 'success');
    }
}

function updatePlantInfoDisplay(plantData, regionData, region) {
    const infoDisplay = document.getElementById('plantInfoDisplay');
    if (infoDisplay) {
        const regionName = region.charAt(0).toUpperCase() + region.slice(1);
        
        infoDisplay.innerHTML = `
            <div class="plant-info-card">
                <h4>🌱 ${plantData.nombre} - Región ${regionName}</h4>
                <div class="plant-description">
                    <p><strong>Características:</strong> ${regionData.descripcion}</p>
                    <p><strong>Notas adicionales:</strong> ${plantData.notas}</p>
                </div>
                <div class="plant-parameters">
                    <h5>Parámetros Ideales:</h5>
                    <div class="param-grid">
                        <div class="param-item">
                            <span class="param-icon">💧</span>
                            <span class="param-label">Humedad Suelo:</span>
                            <span class="param-value">${regionData.soilMin}% - ${regionData.soilMax}%</span>
                        </div>
                        <div class="param-item">
                            <span class="param-icon">🌡️</span>
                            <span class="param-label">Temperatura:</span>
                            <span class="param-value">${regionData.tempOptimal}°C</span>
                        </div>
                        <div class="param-item">
                            <span class="param-icon">🌫️</span>
                            <span class="param-label">Humedad Aire:</span>
                            <span class="param-value">${regionData.humidOptimal}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

function showPlantGlossary() {
    const glossaryModal = document.createElement('div');
    glossaryModal.className = 'glossary-modal';
    glossaryModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
    `;
    
    const glossaryContent = document.createElement('div');
    glossaryContent.style.cssText = `
        background: white;
        padding: 30px;
        border-radius: 15px;
        max-width: 90%;
        max-height: 90%;
        overflow-y: auto;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    
    // Generar contenido del glosario
    let glossaryHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
            <h2>🇪🇨 Glosario de Plantas del Ecuador</h2>
            <p>Guía completa de cultivos por regiones</p>
        </div>
        <div class="glossary-content">
    `;
    
    // Mostrar plantas disponibles
    Object.entries(plantasEcuador).forEach(([key, planta]) => {
        glossaryHTML += `
            <div class="glossary-plant" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 10px;">
                <h4 style="color: #333; margin-bottom: 10px;">${planta.nombre}</h4>
                <p style="font-style: italic; color: #666; margin-bottom: 15px;">${planta.notas}</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px;">
        `;
        
        Object.entries(planta.regiones).forEach(([region, datos]) => {
            const regionName = region.charAt(0).toUpperCase() + region.slice(1);
            glossaryHTML += `
                <div style="background: white; padding: 10px; border-radius: 8px; border-left: 4px solid #2196F3;">
                    <strong>${regionName}:</strong><br>
                    <small>Suelo: ${datos.soilMin}-${datos.soilMax}% | Temp: ${datos.tempOptimal}°C | Hum: ${datos.humidOptimal}%</small><br>
                    <small style="color: #666;">${datos.descripcion}</small>
                </div>
            `;
        });
        
        glossaryHTML += `
                </div>
            </div>
        `;
    });
    
    glossaryHTML += `
        </div>
        <div style="text-align: center; margin-top: 30px;">
            <button id="closeGlossaryBtn" style="
                background: #4CAF50;
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 8px;
                font-size: 1rem;
                cursor: pointer;
            ">
                Cerrar Glosario
            </button>
        </div>
    `;
    
    glossaryContent.innerHTML = glossaryHTML;
    glossaryModal.appendChild(glossaryContent);
    document.body.appendChild(glossaryModal);
    
    // Event listener para cerrar
    const closeBtn = document.getElementById('closeGlossaryBtn');
    closeBtn.onclick = function() {
        glossaryModal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (glossaryModal.parentNode) {
                glossaryModal.parentNode.removeChild(glossaryModal);
            }
        }, 300);
    };
    
    // Cerrar al hacer click fuera
    glossaryModal.onclick = function(e) {
        if (e.target === glossaryModal) {
            closeBtn.click();
        }
    };
}

// ===== CONFIGURACIÓN DE PARÁMETROS =====
function updateParameters() {
    const getValue = (id, defaultValue) => {
        const element = document.getElementById(id);
        return element ? parseInt(element.value) || defaultValue : defaultValue;
    };
    
    plantParameters.soilOptimal = getValue('soilOptimal', 50);
    plantParameters.soilMin = getValue('soilMin', 25);
    plantParameters.soilMax = getValue('soilMax', 75);
    plantParameters.tempOptimal = getValue('tempOptimal', 25);
    plantParameters.humidOptimal = getValue('humidOptimal', 60);
    
    showToastAlert('Parámetros de planta actualizados correctamente', 'success');
    updateParametersDisplay();
}

function updateParametersDisplay() {
    const paramsDisplay = document.getElementById('currentParameters');
    if (paramsDisplay) {
        paramsDisplay.innerHTML = `
            <strong>Parámetros Actuales:</strong><br>
            Humedad Suelo: ${plantParameters.soilMin}% - ${plantParameters.soilMax}%<br>
            Temperatura Óptima: ${plantParameters.tempOptimal}°C<br>
            Humedad Aire Óptima: ${plantParameters.humidOptimal}%
        `;
    }
}


// ===== FUNCIONES DE CONTROL DEL SISTEMA =====
function resetSensors() {
    if (!confirm('¿Resetear los datos de sensores?')) return;
    
    // Limpiar completamente todos los datos
    sensorData = {
        gas: [],
        ultrasonic: [],
        soil: [],
        temperature: [],
        humidity: [],
        timestamps: []
    };
    
    alertStats = {
        bueno: 0,
        regular: 0,
        malo: 0,
        peligroso: 0
    };
    
    systemStats.totalReadings = 0;
    systemStats.alertCount = 0;
    
    // Resetear tarjetas a estado inicial
    const sensorCards = ['gasCard', 'ultrasonicCard', 'soilCard', 'tempCard', 'humidCard'];
    sensorCards.forEach(cardId => {
        const card = document.getElementById(cardId);
        const valueId = cardId.replace('Card', 'Value');
        const statusId = cardId.replace('Card', 'Status');
        
        if (card) card.className = 'status-card normal';
        const valueEl = document.getElementById(valueId);
        const statusEl = document.getElementById(statusId);
        if (valueEl) valueEl.textContent = '0';
        if (statusEl) statusEl.textContent = noSensorMode ? 'Sin datos' : 'Esperando datos...';
    });
    
    // Limpiar gráficas completamente si están inicializadas
    if (chartsInitialized) {
        if (charts.sensors) {
            charts.sensors.data.labels = [];
            charts.sensors.data.datasets.forEach(dataset => {
                dataset.data = [];
            });
            charts.sensors.update('none');
        }
        
        if (charts.gas) {
            charts.gas.data.labels = [];
            charts.gas.data.datasets[0].data = [];
            charts.gas.update('none');
        }
        
        if (charts.ultrasonic) {
            charts.ultrasonic.data.datasets[0].data = [0];
            charts.ultrasonic.data.datasets[0].backgroundColor = '#cccccc';
            charts.ultrasonic.update('none');
        }
        
        if (charts.alerts) {
            charts.alerts.data.datasets[0].data = [0, 0, 0, 0];
            charts.alerts.update('none');
        }
        
        if (charts.irrigation) {
            charts.irrigation.data.datasets[0].data = [0];
            charts.irrigation.update('none');
        }
    }
    
    if (noSensorMode) {
        initializeNoSensorDisplay();
    }
    
    updateStatistics();
    showToastAlert('Datos de sensores reseteados', 'success');
}

function clearData() {
    if (!confirm('¿Limpiar todos los datos del sistema?')) return;
    
    sensorData = {
        gas: [],
        ultrasonic: [],
        soil: [],
        temperature: [],
        humidity: [],
        timestamps: []
    };
    
    systemStats = {
        totalReadings: 0,
        alertCount: 0,
        irrigationCount: 0,
        startTime: Date.now(),
        backupInterval: systemStats.backupInterval
    };
    
    alertStats = {
        bueno: 0,
        regular: 0,
        malo: 0,
        peligroso: 0
    };
    
    alertHistory = [];
    
    const keysToKeep = ['plantParameters', 'gasParameters', 'ultrasonicParameters'];
    Object.keys(localStorage).forEach(key => {
        if (!keysToKeep.includes(key)) {
            localStorage.removeItem(key);
        }
    });
    
    if (noSensorMode) {
        initializeNoSensorDisplay();
    }
    
    updateStatistics();
    showToastAlert('Todos los datos limpiados', 'success');
}

async function emergencyStop() {
    emergencyStopActive = !emergencyStopActive;
    
    if (emergencyStopActive) {
        // APAGAR BOMBA INMEDIATAMENTE
        if (pumpConnected) {
            console.log('PARADA DE EMERGENCIA - Apagando bomba');
            await sendPumpCommand('OFF');
            await new Promise(resolve => setTimeout(resolve, 500));
            pumpActive = false;
            updatePumpDisplay();
        }
        
        autoModeActive = false;
        
        const statusEl = document.getElementById('autoModeStatus');
        if (statusEl) {
            statusEl.textContent = 'Modo: EMERGENCIA';
            statusEl.style.color = '#f44336';
        }
        
        showToastAlert('PARADA DE EMERGENCIA ACTIVADA - Bomba apagada', 'danger');
    } else {
        const statusEl = document.getElementById('autoModeStatus');
        if (statusEl) {
            statusEl.textContent = 'Modo: Manual';
            statusEl.style.color = '#ff9800';
        }
        
        showToastAlert('Parada de emergencia desactivada', 'success');
    }
}
// ===== FUNCIONES DE EXPORTACIÓN Y BACKUP =====
function exportData() {
    try {
        const exportData = {
            timestamp: new Date().toISOString(),
            sensorData: sensorData,
            systemStats: systemStats,
            plantParameters: plantParameters,
            gasParameters: gasParameters,
            ultrasonicParameters: ultrasonicParameters,
            alertHistory: alertHistory,
            alertStats: alertStats,
            systemInfo: {
                noSensorMode: noSensorMode,
                sensorsConnected: sensorsConnected,
                pumpConnected: pumpConnected,
                autoModeActive: autoModeActive
            }
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `irrigation_data_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToastAlert('Datos exportados correctamente', 'success');
    } catch (error) {
        console.error('Error exportando:', error);
        showToastAlert('Error al exportar datos', 'danger');
    }
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (importedData.sensorData && typeof importedData.sensorData === 'object') {
                sensorData = importedData.sensorData;
            }
            
            if (importedData.plantParameters && typeof importedData.plantParameters === 'object') {
                plantParameters = importedData.plantParameters;
                updateParametersDisplay();
            }
            
            if (importedData.gasParameters && typeof importedData.gasParameters === 'object') {
                gasParameters = importedData.gasParameters;
                updateGasParametersDisplay();
            }
            
            if (importedData.ultrasonicParameters && typeof importedData.ultrasonicParameters === 'object') {
                ultrasonicParameters = importedData.ultrasonicParameters;
                updateUltrasonicParametersDisplay();
            }
            
            if (importedData.alertHistory && Array.isArray(importedData.alertHistory)) {
                alertHistory = importedData.alertHistory;
            }
            
            if (importedData.alertStats && typeof importedData.alertStats === 'object') {
                alertStats = importedData.alertStats;
            }
            
            if (importedData.systemStats && typeof importedData.systemStats === 'object') {
                systemStats = { 
                    ...systemStats, 
                    ...importedData.systemStats, 
                    startTime: systemStats.startTime 
                };
            }
            
            // Solo actualizar gráficas si están inicializadas y hay datos
            if (chartsInitialized && shouldUpdateCharts) {
                updateCharts();
            }
            updateStatistics();
            showToastAlert('Datos importados correctamente', 'success');
            
        } catch (error) {
            console.error('Error importando:', error);
            showToastAlert('Error al importar datos: archivo inválido', 'danger');
        }
    };
    
    reader.readAsText(file);
}

// ===== FUNCIONES DE GUARDADO Y CARGA =====
function saveAllData() {
    try {
        localStorage.setItem('sensorData', JSON.stringify(sensorData));
        localStorage.setItem('systemStats', JSON.stringify({
            ...systemStats,
            startTime: systemStats.startTime
        }));
        localStorage.setItem('alertHistory', JSON.stringify(alertHistory));
        localStorage.setItem('alertStats', JSON.stringify(alertStats));
        localStorage.setItem('plantParameters', JSON.stringify(plantParameters));
        localStorage.setItem('gasParameters', JSON.stringify(gasParameters));
        localStorage.setItem('ultrasonicParameters', JSON.stringify(ultrasonicParameters));
        localStorage.setItem('systemConfig', JSON.stringify({
            noSensorMode: noSensorMode,
            autoModeActive: autoModeActive,
            emergencyStopActive: false // Nunca guardar parada de emergencia
        }));
        
        console.log('Datos guardados automáticamente');
    } catch (error) {
        console.error('Error guardando datos:', error);
        showToastAlert('Error guardando datos automáticamente', 'warning');
    }
}

function loadSavedData() {
    try {
        const savedSensorData = localStorage.getItem('sensorData');
        if (savedSensorData) {
            const loadedSensorData = JSON.parse(savedSensorData);
            if (loadedSensorData.timestamps && loadedSensorData.timestamps.length > 0) {
                sensorData = { ...sensorData, ...loadedSensorData };
            }
        }
        
        const savedSystemStats = localStorage.getItem('systemStats');
        if (savedSystemStats) {
            const stats = JSON.parse(savedSystemStats);
            systemStats = { 
                ...systemStats, 
                ...stats, 
                startTime: Date.now()
            };
        }
        
        const savedAlertHistory = localStorage.getItem('alertHistory');
        if (savedAlertHistory) {
            alertHistory = JSON.parse(savedAlertHistory);
        }
        
        const savedAlertStats = localStorage.getItem('alertStats');
        if (savedAlertStats) {
            alertStats = JSON.parse(savedAlertStats);
        }
        
        const savedPlantParameters = localStorage.getItem('plantParameters');
        if (savedPlantParameters) {
            plantParameters = { ...plantParameters, ...JSON.parse(savedPlantParameters) };
        }
        
        const savedGasParameters = localStorage.getItem('gasParameters');
        if (savedGasParameters) {
            gasParameters = { ...gasParameters, ...JSON.parse(savedGasParameters) };
        }
        
        const savedUltrasonicParameters = localStorage.getItem('ultrasonicParameters');
        if (savedUltrasonicParameters) {
            ultrasonicParameters = { ...ultrasonicParameters, ...JSON.parse(savedUltrasonicParameters) };
        }
        
        const savedConfig = localStorage.getItem('systemConfig');
        if (savedConfig) {
            const config = JSON.parse(savedConfig);
            autoModeActive = config.autoModeActive || false;
            emergencyStopActive = false; // Nunca cargar parada de emergencia
        }
        
        console.log('Datos guardados cargados');
    } catch (error) {
        console.error('Error cargando datos:', error);
        showToastAlert('Error cargando datos guardados', 'warning');
        initializeDefaultValues();
    }
}

function initializeDefaultValues() {
    sensorData = {
        gas: [],
        ultrasonic: [],
        soil: [],
        temperature: [],
        humidity: [],
        timestamps: []
    };
    
    systemStats = {
        totalReadings: 0,
        alertCount: 0,
        irrigationCount: 0,
        startTime: Date.now(),
        backupInterval: null
    };
    
    alertStats = {
        bueno: 0,
        regular: 0,
        malo: 0,
        peligroso: 0
    };
    
    alertHistory = [];
    noSensorMode = true;
    autoModeActive = false;
    emergencyStopActive = false;
    shouldUpdateCharts = false; // IMPORTANTE: No actualizar gráficas por defecto
    
    console.log('Valores por defecto inicializados');
}

// ===== FUNCIONES DE UTILIDAD =====
async function connectAllArduinos() {
    showToastAlert('Conectando todos los dispositivos...', 'info');
    try {
        await connectSensorsArduino();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await connectPumpArduino();
        showToastAlert('Conexión de dispositivos completada', 'success');
    } catch (error) {
        showToastAlert('Error en conexión múltiple', 'danger');
    }
}

function disconnectAllArduinos() {
    disconnectSensorsArduino();
    disconnectPumpArduino();
    showToastAlert('Todos los dispositivos desconectados', 'warning');
}

function testConnections() {
    let testResults = [];
    
    if (sensorsConnected) {
        testResults.push('✅ Arduino sensores: Conectado');
    } else {
        testResults.push('❌ Arduino sensores: Desconectado');
    }
    
    if (pumpConnected) {
        testResults.push('✅ Arduino bomba: Conectado');
    } else {
        testResults.push('❌ Arduino bomba: Desconectado');
    }
    
    const message = testResults.join('\n');
    showToastAlert(message, (sensorsConnected && pumpConnected) ? 'success' : 'warning');
}


// ===== INICIALIZACIÓN COMPLETA DEL SISTEMA =====
function initializeSystem() {
    console.log('Inicializando sistema de riego mejorado...');
    
    try {
        // 1. Cargar datos guardados
        loadSavedData();
        
        // 2. Inicializar displays de parámetros
        updateGasParametersDisplay();
        updateUltrasonicParametersDisplay();
        
        // 3. Inicializar display sin sensores
        if (noSensorMode) {
            initializeNoSensorDisplay();
        }
        
        // 4. Inicializar gráficas SIN datos automáticos
        setTimeout(() => {
            initializeCharts();
            console.log('Gráficas inicializadas - shouldUpdateCharts:', shouldUpdateCharts);
        }, 100);
        
        // 5. Actualizar interfaz
        updatePumpDisplay();
        updateParametersDisplay();
        updateStatistics();
        
        // 6. Iniciar actualizador de tiempo
        startTimeUpdater();
        
        // 7. Configurar guardado automático cada 5 minutos
        setInterval(saveAllData, 300000);
        
        console.log('Sistema inicializado correctamente');
        console.log('Estado inicial - noSensorMode:', noSensorMode, 'shouldUpdateCharts:', shouldUpdateCharts);
        showToastAlert('Sistema de riego inicializado correctamente', 'success');
        
    } catch (error) {
        console.error('Error en inicialización:', error);
        showToastAlert('Error en inicialización del sistema', 'danger');
        
        initializeDefaultValues();
        initializeNoSensorDisplay();
        updatePumpDisplay();
        updateParametersDisplay();
        updateStatistics();
    }
}

// ===== FUNCIONES DE DEBUGGING =====
function checkSystemHealth() {
    const health = {
        timestamp: new Date().toISOString(),
        sensorsConnected: sensorsConnected,
        pumpConnected: pumpConnected,
        noSensorMode: noSensorMode,
        shouldUpdateCharts: shouldUpdateCharts,
        chartsInitialized: chartsInitialized,
        dataIntegrity: sensorData.timestamps.length > 0,
        alertsActive: systemStats.alertCount > 0,
        emergencyActive: emergencyStopActive,
        uptime: getSystemUptime(),
        gasParametersValid: gasParameters.bueno < gasParameters.regular && gasParameters.regular < gasParameters.malo,
        ultrasonicParametersValid: ultrasonicParameters.minimo < ultrasonicParameters.regular && ultrasonicParameters.regular < ultrasonicParameters.maximo
    };
    
    console.log('Estado del sistema:', health);
    return health;
}

function getSystemInfo() {
    return {
        version: '2.0 - Corregido',
        noSensorMode: noSensorMode,
        shouldUpdateCharts: shouldUpdateCharts,
        chartsInitialized: chartsInitialized,
        sensorsConnected: sensorsConnected,
        pumpConnected: pumpConnected,
        autoModeActive: autoModeActive,
        emergencyStopActive: emergencyStopActive,
        totalReadings: systemStats.totalReadings,
        alertCount: systemStats.alertCount,
        irrigationCount: systemStats.irrigationCount,
        uptime: getSystemUptime(),
        lastDataReceived: lastDataReceived,
        gasParameters: gasParameters,
        ultrasonicParameters: ultrasonicParameters,
        plantParameters: plantParameters
    };
}

// ===== EVENTOS DEL DOCUMENTO =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM cargado, inicializando sistema corregido...');
    
    // Inicializar después de que la página esté completamente cargada
    setTimeout(() => {
        initializeSystem();
        startSensorDisplayMonitor();
    }, 500);
    
    // Event listeners seguros
    const addEventListenerSafe = (id, event, handler) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
            console.log(`Event listener agregado para ${id}`);
        } else {
            console.warn(`Elemento ${id} no encontrado para event listener`);
        }
    };
    
    // Event listeners para conexiones Arduino
    addEventListenerSafe('connectSensors', 'click', connectSensorsArduino);
    addEventListenerSafe('disconnectSensors', 'click', disconnectSensorsArduino);
    addEventListenerSafe('connectPump', 'click', connectPumpArduino);
    addEventListenerSafe('disconnectPump', 'click', disconnectPumpArduino);
    
    // Event listeners para control de bomba
    addEventListenerSafe('pumpBtn', 'click', togglePump);
    
    // Event listeners para modos
    const autoModeBtn = document.querySelector('[onclick="autoMode()"]');
    if (autoModeBtn) {
        autoModeBtn.addEventListener('click', autoMode);
    }
    
    const manualModeBtn = document.querySelector('[onclick="manualMode()"]');
    if (manualModeBtn) {
        manualModeBtn.addEventListener('click', manualMode);
    }
    
    // Event listeners para nuevas funciones de parámetros
    addEventListenerSafe('plantSelect', 'change', selectPlantEcuador);
    addEventListenerSafe('regionSelect', 'change', selectPlantEcuador);
    addEventListenerSafe('updateGasParamsBtn', 'click', updateGasParameters);
    addEventListenerSafe('updateUltraParamsBtn', 'click', updateUltrasonicParameters);
    addEventListenerSafe('showGlossaryBtn', 'click', showPlantGlossary);
    
    // Event listeners para parámetros de plantas
    const updateParamsBtn = document.querySelector('[onclick="updateParameters()"]');
    if (updateParamsBtn) {
        updateParamsBtn.addEventListener('click', updateParameters);
    }
    
    // Event listeners para archivos
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', importData);
    }
    
    // Event listeners para botones de control
    const controlButtons = [
        { id: 'exportBtn', handler: exportData },
        { id: 'resetBtn', handler: resetSensors },
        { id: 'clearBtn', handler: clearData },
        { id: 'emergencyBtn', handler: emergencyStop }
    ];
    
    controlButtons.forEach(({ id, handler }) => {
        addEventListenerSafe(id, 'click', handler);
    });
    
    // Event listeners para conexiones múltiples
    const connectAllBtn = document.querySelector('[onclick="connectAllArduinos()"]');
    if (connectAllBtn) {
        connectAllBtn.addEventListener('click', connectAllArduinos);
    }
    
    const disconnectAllBtn = document.querySelector('[onclick="disconnectAllArduinos()"]');
    if (disconnectAllBtn) {
        disconnectAllBtn.addEventListener('click', disconnectAllArduinos);
    }
    
    const testConnectionsBtn = document.querySelector('[onclick="testConnections()"]');
    if (testConnectionsBtn) {
        testConnectionsBtn.addEventListener('click', testConnections);
    }
});

// ===== MANEJO DE ERRORES GLOBALES =====
window.addEventListener('error', function(e) {
    console.error('Error global detectado:', e.error);
    showToastAlert('Error del sistema detectado', 'danger');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Promise rechazada no manejada:', e.reason);
    showToastAlert('Error de promesa no manejada', 'warning');
});

// ===== MANEJO DE CIERRE DE PÁGINA =====
window.addEventListener('beforeunload', function(e) {
    console.log('Guardando datos antes del cierre...');
    saveAllData();
    
    if (sensorsConnected) {
        disconnectSensorsArduino();
    }
    
    if (pumpConnected) {
        disconnectPumpArduino();
    }
});

// ===== AÑADIR ESTILOS CSS PARA ALERTAS MODALES =====
const modalStyles = document.createElement('style');
modalStyles.textContent = `
@keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

@keyframes toastProgress {
    from { width: 100%; }
    to { width: 0%; }
}

@keyframes fadeIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
}

@keyframes fadeOut {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(0.9); }
}

@keyframes slideIn {
    from { transform: translateY(-50px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
    20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

.plant-info-card {
    background: #f8f9fa;
    border-radius: 10px;
    padding: 20px;
    margin: 10px 0;
    border-left: 4px solid #4CAF50;
}

.param-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 10px;
}

.param-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: white;
    border-radius: 5px;
}

.param-icon { font-size: 1.2rem; }
.param-label { font-weight: 500; color: #666; }
.param-value { font-weight: bold; color: #4CAF50; }

.glossary-content { max-height: 60vh; overflow-y: auto; }
.glossary-plant {
    margin: 15px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 10px;
    border-left: 4px solid #2196F3;
}
`;
document.head.appendChild(modalStyles);

// ===== HACER DISPONIBLES FUNCIONES GLOBALES PARA DEBUGGING =====
window.getSystemInfo = getSystemInfo;
window.checkSystemHealth = checkSystemHealth;
window.showPlantGlossary = showPlantGlossary;

// ===== LOG FINAL DE CARGA =====
console.log('==== SISTEMA DE RIEGO v2.0 CORREGIDO CARGADO ====');
console.log('Problema de gráficas infinitas: SOLUCIONADO');
console.log('Sistema de alertas toast: IMPLEMENTADO');
console.log('Control de actualizaciones de gráficas: IMPLEMENTADO');
console.log('Variables de control:');
console.log('- noSensorMode:', noSensorMode);
console.log('- shouldUpdateCharts:', shouldUpdateCharts);
console.log('- chartsInitialized:', chartsInitialized);
console.log('================================================');