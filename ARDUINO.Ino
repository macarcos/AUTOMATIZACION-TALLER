// ARDUINO BOMBA - Control Dual USB Serial + Bluetooth v2.3
// Pines: Pin 7 = Relay, Pin 3 = Botón emergencia, Pin 11 = Buzzer
// Bluetooth: Pin 2 = RX, Pin 8 = TX (SoftwareSerial)

#include <SoftwareSerial.h>

// ===== CONFIGURACIÓN DE PINES =====
#define RELAY_PIN 7        // Pin IN1 del relay
#define BOTON_EMERGENCIA 3 // Botón físico de emergencia
#define BUZZER_PIN 11      // Buzzer para confirmación
#define BT_RX_PIN 2        // Pin RX del Bluetooth (conectar a TX del módulo)
#define BT_TX_PIN 8        // Pin TX del Bluetooth (conectar a RX del módulo)

// ===== CONFIGURACIÓN BLUETOOTH =====
SoftwareSerial bluetooth(BT_RX_PIN, BT_TX_PIN);

// ===== CONFIGURACIÓN RELAY =====
const bool RELAY_ACTIVE_HIGH = false; // Ajustar según tu relay

// ===== VARIABLES DE CONTROL =====
bool bombaActiva = false;
bool botonAnterior = HIGH;
unsigned long ultimoDebounce = 0;
const unsigned long DEBOUNCE_DELAY = 50;

// Control de tiempos
unsigned long tiempoInicioBomba = 0;
const unsigned long TIEMPO_MAXIMO = 300000; // 5 minutos máximo
unsigned long ultimoEnvioEstado = 0;
unsigned long ultimoEnvioBluetoothStatus = 0;

// Estadísticas
int vecesActivada = 0;
int vecesEmergencia = 0;
unsigned long tiempoTotalFuncionamiento = 0;

// Control de fuentes de comando
String ultimaFuenteComando = "NINGUNA";
bool comandoDesdeApp = false;
bool comandoDesdeBluetooth = false;

void setup() {
    Serial.begin(9600);           // Comunicación USB con la web app
    bluetooth.begin(9600);        // Comunicación Bluetooth con móvil
    
    // Configurar pines
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(BOTON_EMERGENCIA, INPUT_PULLUP);
    pinMode(BUZZER_PIN, OUTPUT);
    
    // ESTADO INICIAL SEGURO
    forzarBombaOFF();
    bombaActiva = false;
    
    // Mensajes de inicio para ambas conexiones
    enviarMensajeInicio();
    
    // Test inicial del sistema
    testInicial();
    
    Serial.println(F("✅ Sistema dual listo (USB + Bluetooth)"));
    bluetooth.println(F("Sistema bomba dual listo!"));
    bluetooth.println(F("Comandos: ON, OFF, STATUS"));
    
    // Confirmación sonora
    beep(2); // 2 beeps = sistema dual activo
    
    mostrarStatus();
}

void loop() {
    // 1. ALTA PRIORIDAD: Botón de emergencia
    verificarBotonEmergencia();
    
    // 2. Verificar tiempo máximo
    verificarTiempoMaximo();
    
    // 3. Procesar comandos USB Serial (web app)
    if (Serial.available()) {
        String comando = Serial.readStringUntil('\n');
        procesarComando(comando, "WEB_APP");
    }
    
    // 4. Procesar comandos Bluetooth (móvil)
    if (bluetooth.available()) {
        String comando = bluetooth.readStringUntil('\n');
        procesarComando(comando, "BLUETOOTH");
    }
    
    // 5. Enviar estado a web app cada 5 segundos
    if (millis() - ultimoEnvioEstado >= 5000) {
        enviarEstadoWebApp();
        ultimoEnvioEstado = millis();
    }
    
    // 6. Enviar estado a Bluetooth cada 10 segundos
    if (millis() - ultimoEnvioBluetoothStatus >= 10000) {
        enviarEstadoBluetooth();
        ultimoEnvioBluetoothStatus = millis();
    }
    
    delay(10);
}

// ===== ENVÍO DE MENSAJES DE INICIO =====
void enviarMensajeInicio() {
    // Mensaje para USB Serial (Web App)
    Serial.println(F("╔══════════════════════════════════╗"));
    Serial.println(F("║  BOMBA DUAL v2.3 - WEB + BT     ║"));
    Serial.println(F("║     INICIO SEGURO - OFF          ║"));
    Serial.println(F("╚══════════════════════════════════╝"));
    
    // Mensaje para Bluetooth (Móvil)
    bluetooth.println(F("============================="));
    bluetooth.println(F("  BOMBA RIEGO v2.3 - MOVIL  "));
    bluetooth.println(F("   Conectado via Bluetooth   "));
    bluetooth.println(F("============================="));
    bluetooth.println(F("Estado: BOMBA APAGADA"));
    bluetooth.println(F(""));
    bluetooth.println(F("Comandos disponibles:"));
    bluetooth.println(F("ON    - Encender bomba"));
    bluetooth.println(F("OFF   - Apagar abomba"));
    bluetooth.println(F("STATUS - Ver estado"));
    bluetooth.println(F("HELP   - Ayuda"));
    bluetooth.println(F("============================="));
}

// ===== PROCESAMIENTO DE COMANDOS UNIFICADO =====
void procesarComando(String comando, String fuente) {
    comando.trim();
    comando.toUpperCase();
    
    if (comando.length() == 0) return;
    
    // Registrar fuente del comando
    ultimaFuenteComando = fuente;
    comandoDesdeApp = (fuente == "WEB_APP");
    comandoDesdeBluetooth = (fuente == "BLUETOOTH");
    
    // Log para depuración
    Serial.print(F("📨 ["));
    Serial.print(fuente);
    Serial.print(F("] Comando: '"));
    Serial.print(comando);
    Serial.println(F("'"));
    
    // Procesar comandos
    if (comando == "ON" || comando == "PUMP_ON") {
        encenderBomba();
    }
    else if (comando == "OFF" || comando == "PUMP_OFF") {
        apagarBomba();
    }
    else if (comando == "STATUS" || comando == "STATE") {
        if (comandoDesdeBluetooth) {
            mostrarStatusBluetooth();
        } else {
            mostrarStatus();
        }
    }
    else if (comando == "TEST" && comandoDesdeApp) {
        // Solo permitir test desde web app por seguridad
        testRelay();
    }
    else if (comando == "HELP" && comandoDesdeBluetooth) {
        mostrarAyudaBluetooth();
    }
    else if (comando == "RESET" && comandoDesdeApp) {
        // Reset solo desde web app
        resetearEstadisticas();
    }
    else if (comando.length() > 0) {
        enviarErrorComando(comando, fuente);
    }
}

// ===== FUNCIONES DE CONTROL DE BOMBA MEJORADAS =====
void encenderBomba() {
    if (!bombaActiva) {
        bombaActiva = true;
        tiempoInicioBomba = millis();
        vecesActivada++;
        
        // Activar relay
        if (RELAY_ACTIVE_HIGH) {
            digitalWrite(RELAY_PIN, HIGH);
        } else {
            digitalWrite(RELAY_PIN, LOW);
        }
        
        // Notificar a ambas conexiones
        String mensaje = "✅ BOMBA ENCENDIDA por " + ultimaFuenteComando;
        Serial.println(mensaje);
        
        bluetooth.println(F("✅ BOMBA ENCENDIDA"));
        bluetooth.print(F("Fuente: "));
        bluetooth.println(ultimaFuenteComando);
        bluetooth.print(F("Activacion #"));
        bluetooth.println(vecesActivada);
        bluetooth.println(F("Tiempo max: 5 minutos"));
        
        beep(2); // Confirmación sonora
        
    } else {
        String mensaje = F("⚠️ Bomba ya encendida");
        Serial.println(mensaje);
        if (comandoDesdeBluetooth) {
            bluetooth.println(mensaje);
        }
    }
}

void apagarBomba() {
    if (bombaActiva) {
        // Calcular tiempo de funcionamiento
        unsigned long tiempoFuncionamiento = millis() - tiempoInicioBomba;
        tiempoTotalFuncionamiento += tiempoFuncionamiento;
        
        bombaActiva = false;
        
        // Desactivar relay
        if (RELAY_ACTIVE_HIGH) {
            digitalWrite(RELAY_PIN, LOW);
        } else {
            digitalWrite(RELAY_PIN, HIGH);
        }
        
        // Notificar a ambas conexiones
        String mensaje = "🛑 BOMBA APAGADA por " + ultimaFuenteComando;
        Serial.println(mensaje);
        Serial.print(F("⏱️ Funcionó: "));
        Serial.print(tiempoFuncionamiento / 1000);
        Serial.println(F(" seg"));
        
        bluetooth.println(F("🛑 BOMBA APAGADA"));
        bluetooth.print(F("Fuente: "));
        bluetooth.println(ultimaFuenteComando);
        bluetooth.print(F("Tiempo: "));
        bluetooth.print(tiempoFuncionamiento / 1000);
        bluetooth.println(F(" seg"));
        
        beep(1); // Confirmación sonora
        
    } else {
        String mensaje = F("⚠️ Bomba ya apagada");
        Serial.println(mensaje);
        if (comandoDesdeBluetooth) {
            bluetooth.println(mensaje);
        }
    }
}

// ===== BOTÓN DE EMERGENCIA CON NOTIFICACIÓN DUAL =====
void verificarBotonEmergencia() {
    bool estadoActual = digitalRead(BOTON_EMERGENCIA);
    
    if (estadoActual != botonAnterior) {
        ultimoDebounce = millis();
    }
    
    if ((millis() - ultimoDebounce) > DEBOUNCE_DELAY) {
        if (botonAnterior == HIGH && estadoActual == LOW) {
            if (bombaActiva) {
                Serial.println(F("🚨 ¡EMERGENCIA FÍSICA ACTIVADA!"));
                Serial.println(F("🛑 Bomba apagada inmediatamente"));
                
                bluetooth.println(F("🚨 EMERGENCIA!"));
                bluetooth.println(F("Boton fisico presionado"));
                bluetooth.println(F("Bomba apagada por seguridad"));
                
                ultimaFuenteComando = "BOTON_EMERGENCIA";
                apagarBomba();
                vecesEmergencia++;
                
                // Alarma de emergencia
                beep(5);
                
            } else {
                Serial.println(F("🚨 Botón emergencia (bomba ya apagada)"));
                bluetooth.println(F("Boton emergencia OK"));
                beep(1);
            }
        }
    }
    
    botonAnterior = estadoActual;
}

// ===== ENVÍO DE ESTADO PARA WEB APP (JSON) =====
void enviarEstadoWebApp() {
    Serial.print(F("{\"pump_active\":"));
    Serial.print(bombaActiva ? F("true") : F("false"));
    Serial.print(F(",\"activations\":"));
    Serial.print(vecesActivada);
    Serial.print(F(",\"emergencies\":"));
    Serial.print(vecesEmergencia);
    Serial.print(F(",\"total_time\":"));
    Serial.print(tiempoTotalFuncionamiento / 1000);
    Serial.print(F(",\"last_command_source\":\""));
    Serial.print(ultimaFuenteComando);
    Serial.print(F("\""));
    
    if (bombaActiva) {
        Serial.print(F(",\"current_time\":"));
        Serial.print((millis() - tiempoInicioBomba) / 1000);
        Serial.print(F(",\"time_left\":"));
        Serial.print((TIEMPO_MAXIMO - (millis() - tiempoInicioBomba)) / 1000);
    }
    
    Serial.println(F("}"));
}

// ===== ENVÍO DE ESTADO PARA BLUETOOTH (LEGIBLE) =====
void enviarEstadoBluetooth() {
    bluetooth.println(F("--- ESTADO BOMBA ---"));
    bluetooth.print(F("Estado: "));
    bluetooth.println(bombaActiva ? F("ENCENDIDA") : F("APAGADA"));
    bluetooth.print(F("Activaciones: "));
    bluetooth.println(vecesActivada);
    bluetooth.print(F("Emergencias: "));
    bluetooth.println(vecesEmergencia);
    bluetooth.print(F("Ultimo comando: "));
    bluetooth.println(ultimaFuenteComando);
    
    if (bombaActiva) {
        unsigned long tiempoActual = (millis() - tiempoInicioBomba) / 1000;
        unsigned long tiempoRestante = (TIEMPO_MAXIMO - (millis() - tiempoInicioBomba)) / 1000;
        
        bluetooth.print(F("Tiempo activa: "));
        bluetooth.print(tiempoActual);
        bluetooth.println(F(" seg"));
        bluetooth.print(F("Tiempo restante: "));
        bluetooth.print(tiempoRestante);
        bluetooth.println(F(" seg"));
    }
    
    bluetooth.println(F("-------------------"));
}

// ===== MOSTRAR STATUS BLUETOOTH =====
void mostrarStatusBluetooth() {
    bluetooth.println(F("====== BOMBA RIEGO ======"));
    bluetooth.print(F("Estado: "));
    bluetooth.println(bombaActiva ? F("ON") : F("OFF"));
    bluetooth.print(F("Pin relay: "));
    bluetooth.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    bluetooth.print(F("Boton emergencia: "));
    bluetooth.println(digitalRead(BOTON_EMERGENCIA) ? F("OK") : F("PRESIONADO"));
    bluetooth.print(F("Activaciones: "));
    bluetooth.println(vecesActivada);
    bluetooth.print(F("Paradas emergencia: "));
    bluetooth.println(vecesEmergencia);
    bluetooth.print(F("Ultimo comando desde: "));
    bluetooth.println(ultimaFuenteComando);
    bluetooth.println(F("========================"));
}

// ===== AYUDA PARA BLUETOOTH =====
void mostrarAyudaBluetooth() {
    bluetooth.println(F("====== COMANDOS BOMBA ======"));
    bluetooth.println(F("ON     - Encender bomba"));
    bluetooth.println(F("OFF    - Apagar bomba"));
    bluetooth.println(F("STATUS - Ver estado completo"));
    bluetooth.println(F("HELP   - Esta ayuda"));
    bluetooth.println(F(""));
    bluetooth.println(F("NOTAS:"));
    bluetooth.println(F("- Tiempo max: 5 minutos"));
    bluetooth.println(F("- Boton fisico = emergencia"));
    bluetooth.println(F("- Control dual: App + Movil"));
    bluetooth.println(F("==========================="));
}

// ===== FUNCIONES DE UTILIDAD =====
void forzarBombaOFF() {
    if (RELAY_ACTIVE_HIGH) {
        digitalWrite(RELAY_PIN, LOW);
    } else {
        digitalWrite(RELAY_PIN, HIGH);
    }
}

void verificarTiempoMaximo() {
    if (bombaActiva && (millis() - tiempoInicioBomba >= TIEMPO_MAXIMO)) {
        Serial.println(F("⚠️ PROTECCIÓN: Tiempo máximo (5 min)"));
        bluetooth.println(F("PROTECCION: Tiempo maximo"));
        bluetooth.println(F("Bomba apagada automaticamente"));
        
        ultimaFuenteComando = "PROTECCION_TIEMPO";
        apagarBomba();
        beep(5);
    }
}

void resetearEstadisticas() {
    vecesActivada = 0;
    vecesEmergencia = 0;
    tiempoTotalFuncionamiento = 0;
    ultimaFuenteComando = "RESET";
    
    Serial.println(F("🔄 Estadísticas reseteadas"));
}

void enviarErrorComando(String comando, String fuente) {
    String mensaje = "❓ Comando desconocido: '" + comando + "'";
    
    if (fuente == "WEB_APP") {
        Serial.println(mensaje);
        Serial.println(F("💡 Comandos: ON, OFF, STATUS, TEST, RESET"));
    } else {
        bluetooth.println(F("Comando desconocido"));
        bluetooth.println(F("Envía HELP para ver comandos"));
    }
}

void mostrarStatus() {
    Serial.println(F("╔════════════ ESTADO DUAL ════════════╗"));
    Serial.print(F("║ Estado bomba: "));
    Serial.println(bombaActiva ? F("ENCENDIDA ✅") : F("APAGADA ❌"));
    Serial.print(F("║ Pin relay: "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    Serial.print(F("║ Activaciones: "));
    Serial.println(vecesActivada);
    Serial.print(F("║ Emergencias: "));
    Serial.println(vecesEmergencia);
    Serial.print(F("║ Último comando: "));
    Serial.println(ultimaFuenteComando);
    Serial.print(F("║ Control USB: "));
    Serial.println(F("ACTIVO"));
    Serial.print(F("║ Control Bluetooth: "));
    Serial.println(F("ACTIVO"));
    Serial.println(F("╚════════════════════════════════════╝"));
}

void testInicial() {
    Serial.println(F("🔧 TEST SISTEMA DUAL"));
    bluetooth.println(F("Probando sistema..."));
    
    Serial.print(F("Pin relay "));
    Serial.print(RELAY_PIN);
    Serial.print(F(": "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    
    Serial.print(F("Boton emergencia "));
    Serial.print(BOTON_EMERGENCIA);
    Serial.print(F(": "));
    Serial.println(digitalRead(BOTON_EMERGENCIA) ? F("OK") : F("PRESIONADO"));
    
    bluetooth.println(F("Test completado"));
    Serial.println(F("✅ Test inicial OK"));
}

void testRelay() {
    Serial.println(F("🔧 TEST RELAY (solo desde web app)"));
    
    bool estadoOriginal = bombaActiva;
    
    Serial.println(F("1. Estado OFF"));
    forzarBombaOFF();
    delay(2000);
    
    Serial.println(F("2. Estado ON (3 seg)"));
    if (RELAY_ACTIVE_HIGH) {
        digitalWrite(RELAY_PIN, HIGH);
    } else {
        digitalWrite(RELAY_PIN, LOW);
    }
    delay(3000);
    
    Serial.println(F("3. Regresando a OFF"));
    forzarBombaOFF();
    
    if (estadoOriginal) {
        encenderBomba();
    }
    
    Serial.println(F("✅ Test relay completado"));
}

void beep(int cantidad) {
    for (int i = 0; i < cantidad; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(100);
        digitalWrite(BUZZER_PIN, LOW);
        if (i < cantidad - 1) delay(150);
    }
}
