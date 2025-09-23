// ARDUINO BOMBA - Sistema Riego v2.2 SUPER CORREGIDO
// CORRECCIONES: Estado inicial OFF, botón emergencia funcional, control correcto
// Pin 7 = IN1 del relay, Pin 3 = botón emergencia

// ===== CONFIGURACIÓN DE PINES =====
#define RELAY_PIN 7        // Pin IN1 del relay para la bomba
#define BOTON_EMERGENCIA 3 // Botón físico para EMERGENCIA (solo apagar)
#define BUZZER_PIN 11      // Buzzer para confirmación

// ===== CONFIGURACIÓN RELAY =====
// Configuración para relay típico (activo en LOW)
const bool RELAY_ACTIVE_HIGH = false;

// ===== VARIABLES DE CONTROL =====
bool bombaActiva = false;           // Estado de la bomba
bool botonAnterior = HIGH;          // Estado anterior del botón
unsigned long ultimoDebounce = 0;   // Control debounce
const unsigned long DEBOUNCE_DELAY = 50; // 50ms debounce

// Control de tiempos
unsigned long tiempoInicioBomba = 0;
const unsigned long TIEMPO_MAXIMO = 300000; // 5 minutos máximo
unsigned long ultimoEnvioEstado = 0;

// Estadísticas
int vecesActivada = 0;
int vecesEmergencia = 0;
unsigned long tiempoTotalFuncionamiento = 0;

void setup() {
    Serial.begin(9600);
    
    // Configurar pines
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(BOTON_EMERGENCIA, INPUT_PULLUP);  // Con resistencia pull-up interna
    pinMode(BUZZER_PIN, OUTPUT);
    
    // CRÍTICO: ESTADO INICIAL SEGURO - BOMBA SIEMPRE OFF
    forzarBombaOFF();
    bombaActiva = false;
    
    Serial.println(F("╔══════════════════════════════════╗"));
    Serial.println(F("║  ARDUINO BOMBA v2.2 CORREGIDO   ║"));
    Serial.println(F("║    INICIO SEGURO - BOMBA OFF     ║"));
    Serial.println(F("╚══════════════════════════════════╝"));
    Serial.println();
    
    // Test inicial del sistema
    testInicial();
    
    Serial.println(F("✅ Sistema listo"));
    Serial.println(F("📱 Comandos disponibles:"));
    Serial.println(F("   ON  / PUMP_ON    - Encender bomba"));
    Serial.println(F("   OFF / PUMP_OFF   - Apagar bomba"));
    Serial.println(F("   STATUS           - Ver estado"));
    Serial.println(F("   TEST             - Probar relay"));
    Serial.println(F("🚨 Botón emergencia: Pin 3 (SOLO APAGAR)"));
    Serial.println(F("💡 Pin relay IN1: Pin 7"));
    Serial.println(F("====================================="));
    
    // Confirmación sonora - 1 beep = listo
    beep(1);
    
    mostrarStatus();
}

void loop() {
    // 1. ALTA PRIORIDAD: Monitorear botón de emergencia
    verificarBotonEmergencia();
    
    // 2. Verificar tiempo máximo de funcionamiento
    verificarTiempoMaximo();
    
    // 3. Procesar comandos serie
    if (Serial.available()) {
        procesarComando();
    }
    
    // 4. Enviar estado cada 5 segundos
    if (millis() - ultimoEnvioEstado >= 5000) {
        enviarEstado();
        ultimoEnvioEstado = millis();
    }
    
    delay(10); // Reducido para respuesta rápida del botón
}

// ===== FUNCIÓN CRÍTICA: FORZAR BOMBA OFF =====
void forzarBombaOFF() {
    if (RELAY_ACTIVE_HIGH) {
        digitalWrite(RELAY_PIN, LOW);   // OFF para relay normal
    } else {
        digitalWrite(RELAY_PIN, HIGH);  // OFF para relay invertido
    }
    
    Serial.println(F("🛑 BOMBA FORZADA A OFF (seguridad)"));
    Serial.print(F("🔧 Pin IN1 ("));
    Serial.print(RELAY_PIN);
    Serial.print(F("): "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
}

// ===== BOTÓN DE EMERGENCIA MEJORADO =====
void verificarBotonEmergencia() {
    bool estadoActual = digitalRead(BOTON_EMERGENCIA);
    
    // Detectar cambio de estado del botón
    if (estadoActual != botonAnterior) {
        ultimoDebounce = millis();
    }
    
    // Verificar que haya pasado el tiempo de debounce
    if ((millis() - ultimoDebounce) > DEBOUNCE_DELAY) {
        // Detectar presión del botón (flanco descendente)
        if (botonAnterior == HIGH && estadoActual == LOW) {
            // EMERGENCIA: Solo puede APAGAR la bomba
            if (bombaActiva) {
                Serial.println(F("🚨 ¡BOTÓN EMERGENCIA PRESIONADO!"));
                Serial.println(F("🛑 APAGANDO BOMBA INMEDIATAMENTE"));
                
                apagarBomba();
                vecesEmergencia++;
                
                // Alarma de emergencia (3 beeps rápidos)
                beep(3);
                
                Serial.print(F("📊 Paradas de emergencia totales: "));
                Serial.println(vecesEmergencia);
            } else {
                Serial.println(F("🚨 Botón emergencia presionado"));
                Serial.println(F("💡 Bomba ya está apagada"));
                beep(1); // Un beep de confirmación
            }
        }
    }
    
    botonAnterior = estadoActual;
}

// ===== FUNCIONES DE CONTROL DE BOMBA =====
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
        
        Serial.println(F("✅ BOMBA ENCENDIDA"));
        Serial.print(F("🔄 Activación #"));
        Serial.println(vecesActivada);
        Serial.print(F("🔧 Relay IN1 activado: "));
        Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
        Serial.println(F("⏱️ Tiempo máximo: 5 minutos"));
        
        beep(2); // Dos beeps = encendido
    } else {
        Serial.println(F("⚠️ Bomba ya está encendida"));
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
        
        Serial.println(F("🛑 BOMBA APAGADA"));
        Serial.print(F("⏱️ Funcionó por: "));
        Serial.print(tiempoFuncionamiento / 1000);
        Serial.println(F(" segundos"));
        Serial.print(F("🔧 Relay IN1 desactivado: "));
        Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
        
        beep(1); // Un beep = apagado
    } else {
        Serial.println(F("⚠️ Bomba ya está apagada"));
    }
}

// ===== VERIFICAR TIEMPO MÁXIMO =====
void verificarTiempoMaximo() {
    if (bombaActiva && (millis() - tiempoInicioBomba >= TIEMPO_MAXIMO)) {
        Serial.println(F("⚠️ PROTECCIÓN: Tiempo máximo alcanzado (5 min)"));
        Serial.println(F("🛑 Apagando automáticamente..."));
        
        apagarBomba();
        
        // Alarma de protección (5 beeps)
        beep(5);
    }
}

// ===== PROCESAR COMANDOS SERIE =====
void procesarComando() {
    String comando = Serial.readStringUntil('\n');
    comando.trim();
    comando.toUpperCase();
    
    Serial.print(F("📨 Comando recibido: '"));
    Serial.print(comando);
    Serial.println(F("'"));
    
    if (comando == "ON" || comando == "PUMP_ON") {
        encenderBomba();
    }
    else if (comando == "OFF" || comando == "PUMP_OFF") {
        apagarBomba();
    }
    else if (comando == "STATUS") {
        mostrarStatus();
    }
    else if (comando == "TEST") {
        testRelay();
    }
    else if (comando == "RESET") {
        // Reset estadísticas
        vecesActivada = 0;
        vecesEmergencia = 0;
        tiempoTotalFuncionamiento = 0;
        Serial.println(F("🔄 Estadísticas reseteadas"));
    }
    else if (comando.length() > 0) {
        Serial.print(F("❓ Comando desconocido: '"));
        Serial.print(comando);
        Serial.println(F("'"));
        Serial.println(F("💡 Comandos: ON, OFF, STATUS, TEST, RESET"));
    }
}

// ===== ENVIAR ESTADO (JSON para web app) =====
void enviarEstado() {
    Serial.print(F("{\"pump_active\":"));
    Serial.print(bombaActiva ? F("true") : F("false"));
    Serial.print(F(",\"activations\":"));
    Serial.print(vecesActivada);
    Serial.print(F(",\"emergencies\":"));
    Serial.print(vecesEmergencia);
    Serial.print(F(",\"total_time\":"));
    Serial.print(tiempoTotalFuncionamiento / 1000);
    
    if (bombaActiva) {
        Serial.print(F(",\"current_time\":"));
        Serial.print((millis() - tiempoInicioBomba) / 1000);
        Serial.print(F(",\"time_left\":"));
        Serial.print((TIEMPO_MAXIMO - (millis() - tiempoInicioBomba)) / 1000);
    }
    
    Serial.println(F("}"));
}

// ===== MOSTRAR STATUS COMPLETO =====
void mostrarStatus() {
    Serial.println(F("╔═══════════ ESTADO BOMBA ═══════════╗"));
    Serial.print(F("║ Estado actual: "));
    if (bombaActiva) {
        Serial.println(F("ENCENDIDA ✅"));
    } else {
        Serial.println(F("APAGADA ❌"));
    }
    
    Serial.print(F("║ Pin relay IN1 ("));
    Serial.print(RELAY_PIN);
    Serial.print(F("): "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    
    Serial.print(F("║ Activaciones totales: "));
    Serial.println(vecesActivada);
    
    Serial.print(F("║ Paradas emergencia: "));
    Serial.println(vecesEmergencia);
    
    Serial.print(F("║ Tiempo total funcionamiento: "));
    Serial.print(tiempoTotalFuncionamiento / 1000);
    Serial.println(F(" seg"));
    
    if (bombaActiva) {
        unsigned long tiempoActual = millis() - tiempoInicioBomba;
        Serial.print(F("║ Tiempo funcionando: "));
        Serial.print(tiempoActual / 1000);
        Serial.println(F(" seg"));
        
        unsigned long tiempoRestante = TIEMPO_MAXIMO - tiempoActual;
        Serial.print(F("║ Tiempo restante: "));
        Serial.print(tiempoRestante / 1000);
        Serial.println(F(" seg"));
    }
    
    Serial.print(F("║ Botón emergencia ("));
    Serial.print(BOTON_EMERGENCIA);
    Serial.print(F("): "));
    Serial.println(digitalRead(BOTON_EMERGENCIA) ? F("NO presionado") : F("PRESIONADO"));
    
    Serial.println(F("╚════════════════════════════════════╝"));
}

// ===== TEST INICIAL DEL SISTEMA =====
void testInicial() {
    Serial.println(F("🔧 TEST INICIAL DEL SISTEMA"));
    
    // Test del relay
    Serial.println(F("1️⃣ Probando relay..."));
    Serial.print(F("   Configuración: "));
    Serial.println(RELAY_ACTIVE_HIGH ? F("ACTIVE HIGH") : F("ACTIVE LOW"));
    Serial.print(F("   Pin IN1 inicial: "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    
    // Test del botón
    Serial.println(F("2️⃣ Probando botón emergencia..."));
    Serial.print(F("   Estado botón pin "));
    Serial.print(BOTON_EMERGENCIA);
    Serial.print(F(": "));
    Serial.println(digitalRead(BOTON_EMERGENCIA) ? F("HIGH (no presionado)") : F("LOW (presionado)"));
    
    // Test del buzzer
    Serial.println(F("3️⃣ Probando buzzer..."));
    beep(1);
    
    Serial.println(F("✅ Test inicial completado"));
    Serial.println();
}

// ===== TEST COMPLETO DEL RELAY =====
void testRelay() {
    Serial.println(F("🔧 INICIANDO PRUEBA COMPLETA DEL RELAY"));
    
    bool estadoOriginal = bombaActiva;
    
    // Si la bomba estaba encendida, avisamos que la vamos a usar para test
    if (bombaActiva) {
        Serial.println(F("⚠️ Bomba está activa - será incluida en el test"));
    }
    
    Serial.println(F(""));
    Serial.println(F("1️⃣ Estado OFF (seguro)"));
    forzarBombaOFF();
    Serial.print(F("   Pin IN1: "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    delay(2000);
    
    Serial.println(F("2️⃣ Estado ON (3 segundos)"));
    if (RELAY_ACTIVE_HIGH) {
        digitalWrite(RELAY_PIN, HIGH);
    } else {
        digitalWrite(RELAY_PIN, LOW);
    }
    Serial.print(F("   Pin IN1: "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    Serial.println(F("   👂 Escucha el 'click' del relay"));
    Serial.println(F("   👀 Observa si la bomba funciona"));
    delay(3000);
    
    Serial.println(F("3️⃣ Regresando a OFF"));
    forzarBombaOFF();
    Serial.print(F("   Pin IN1: "));
    Serial.println(digitalRead(RELAY_PIN) ? F("HIGH") : F("LOW"));
    
    // Restaurar estado original
    if (estadoOriginal) {
        Serial.println(F("🔄 Restaurando estado original..."));
        encenderBomba();
    }
    
    Serial.println(F(""));
    Serial.println(F("✅ PRUEBA COMPLETADA"));
    Serial.println(F("🔍 Si no funcionó:"));
    Serial.println(F("   • Verifica conexiones IN1 → Pin 7"));
    Serial.println(F("   • Verifica alimentación del relay"));
    Serial.println(F("   • Verifica conexiones de la bomba"));
    Serial.println(F(""));
}

// ===== FUNCIÓN BUZZER =====
void beep(int cantidad) {
    for (int i = 0; i < cantidad; i++) {
        digitalWrite(BUZZER_PIN, HIGH);
        delay(100);
        digitalWrite(BUZZER_PIN, LOW);
        if (i < cantidad - 1) delay(150); // Pausa entre beeps
    }
}