// SISTEMA COMPLETO MEJORADO - Compatible con Web App v2.0
// Sensores: MQ-135 (Gas), DHT11 (Temp/Hum), HC-SR04 (Distancia), YL-69 (Suelo), Buzzer

#include <DHT.h>

// Configuración DHT11
#define DHT_PIN 3
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// Configuración Sensor Ultrasónico HC-SR04
#define TRIG_PIN 4
#define ECHO_PIN 5

// Configuración Sensor Humedad Suelo YL-69
#define SOIL_PIN A1

// Configuración Buzzer
#define BUZZER_PIN 6

// Configuración MQ-135 GAS SENSOR
const int mq135Pin = A0;
int valorReferencia = 0;
int lecturaActual = 0;

// Variables para detección y control
bool gasDetectado = false;
int historialGas[5];
int indiceHistorial = 0;
unsigned long ultimaLecturaDHT = 0;
unsigned long ultimoEnvio = 0;
const unsigned long INTERVALO_ENVIO = 1000; // Enviar datos cada 1 segundo

// Variables para control de buzzer (alertas locales)
unsigned long inicioAlarmaSuelo = 0;
unsigned long inicioAlarmaGas = 0;
unsigned long inicioAlarmaDistancia = 0;
bool alarmaSueloActiva = false;
bool alarmaGasActiva = false;
bool alarmaDistanciaActiva = false;

void setup() {
  Serial.begin(9600);
  dht.begin();
  
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  Serial.println(F("╔══════════════════════════════════╗"));
  Serial.println(F("║  SISTEMA RIEGO v2.0 - ARDUINO   ║"));
  Serial.println(F("║    Compatible con Web App        ║"));
  Serial.println(F("╚══════════════════════════════════╝"));
  
  Serial.println(F("🔥 Precalentando MQ-135 (10s)..."));
  delay(10000);
  
  calibrarSensorGas();
  probarTodosSensores();
  
  Serial.println(F("✅ Sistema listo - Enviando datos JSON"));
  Serial.println(F("================================================"));
}

void loop() {
  unsigned long tiempoActual = millis();
  
  // Leer sensores con frecuencia adecuada
  int gasValue = leerGasPromedio();
  float distancia = leerDistancia();
  int humedadSuelo = leerHumedadSuelo();
  
  // Leer DHT11 cada 2 segundos (es lento)
  static float temperatura = 0;
  static float humedad = 0;
  if(tiempoActual - ultimaLecturaDHT > 2000) {
    float tempTemp = dht.readTemperature();
    float tempHum = dht.readHumidity();
    
    if(!isnan(tempTemp) && !isnan(tempHum)) {
      temperatura = tempTemp;
      humedad = tempHum;
    }
    ultimaLecturaDHT = tiempoActual;
  }
  
  // Controlar buzzer para alertas locales
  controlarBuzzerLocal(gasValue, distancia, humedadSuelo);
  
  // Enviar datos a la web app cada segundo
  if(tiempoActual - ultimoEnvio >= INTERVALO_ENVIO) {
    enviarDatosWeb(gasValue, distancia, humedadSuelo, temperatura, humedad);
    ultimoEnvio = tiempoActual;
  }
  
  delay(300); // Lectura rápida pero no excesiva
}

void calibrarSensorGas() {
  Serial.println(F("⚖️ Calibrando MQ-135..."));
  
  long suma = 0;
  for(int i = 0; i < 50; i++) {
    suma += analogRead(mq135Pin);
    delay(100);
    if(i % 10 == 0) Serial.print(F("."));
  }
  
  valorReferencia = suma / 50;
  
  // Inicializar historial
  for(int i = 0; i < 5; i++) {
    historialGas[i] = valorReferencia;
  }
  
  Serial.println();
  Serial.print(F("🎯 Valor de referencia: "));
  Serial.println(valorReferencia);
}

int leerGasPromedio() {
  long suma = 0;
  for(int i = 0; i < 3; i++) {
    suma += analogRead(mq135Pin);
    delay(10);
  }
  
  int promedio = suma / 3;
  
  // Agregar al historial
  historialGas[indiceHistorial] = promedio;
  indiceHistorial = (indiceHistorial + 1) % 5;
  
  return promedio;
}

float leerDistancia() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duracion = pulseIn(ECHO_PIN, HIGH, 30000); // Timeout de 30ms
  
  if(duracion == 0) {
    return -1; // Error en lectura
  }
  
  float distancia = (duracion * 0.034) / 2;
  
  if(distancia > 400 || distancia < 2) {
    return -1;
  }
  
  return distancia;
}

int leerHumedadSuelo() {
  int valorSuelo = analogRead(SOIL_PIN);
  
  // Mapear a porcentaje: 0% = muy seco, 100% = muy húmedo
  // Ajustar estos valores según tu sensor específico
  int porcentajeHumedad = map(valorSuelo, 1023, 300, 0, 100);
  
  if(porcentajeHumedad < 0) porcentajeHumedad = 0;
  if(porcentajeHumedad > 100) porcentajeHumedad = 100;
  
  return porcentajeHumedad;
}

void enviarDatosWeb(int gas, float ultra, int suelo, float temp, float hum) {
  // FORMATO JSON para la web app
  Serial.print(F("{"));
  Serial.print(F("\"gas\":"));
  Serial.print(gas);
  Serial.print(F(",\"ultrasonic\":"));
  
  if(ultra < 0) {
    Serial.print(F("0"));
  } else {
    Serial.print(ultra, 1);
  }
  
  Serial.print(F(",\"soil\":"));
  Serial.print(suelo);
  Serial.print(F(",\"temperature\":"));
  Serial.print(temp, 1);
  Serial.print(F(",\"humidity\":"));
  Serial.print(hum, 1);
  Serial.print(F(",\"timestamp\":"));
  Serial.print(millis());
  Serial.println(F("}"));
  
  // TAMBIÉN enviar formato legible para debugging
  Serial.print(F("DEBUG: Gas="));
  Serial.print(gas);
  Serial.print(F(" | Ultra="));
  if(ultra < 0) {
    Serial.print(F("ERROR"));
  } else {
    Serial.print(ultra, 1);
    Serial.print(F("cm"));
  }
  Serial.print(F(" | Suelo="));
  Serial.print(suelo);
  Serial.print(F("% | Temp="));
  Serial.print(temp, 1);
  Serial.print(F("°C | Hum="));
  Serial.print(hum, 1);
  Serial.println(F("%"));
}

void controlarBuzzerLocal(int gasValue, float distancia, int humedadSuelo) {
  unsigned long tiempoActual = millis();
  
  // Evaluar condiciones críticas
  int cambioGas = abs(gasValue - valorReferencia);
  bool gasCritico = (cambioGas >= 50);
  bool distanciaCritica = (distancia > 0 && distancia < 5) || distancia > 30;
  bool sueloMuySeco = (humedadSuelo < 20);
  
  // ALARMA DE GAS (máxima prioridad)
  if(gasCritico) {
    if(!alarmaGasActiva) {
      alarmaGasActiva = true;
      inicioAlarmaGas = tiempoActual;
    }
    // Pitido rápido continuo
    digitalWrite(BUZZER_PIN, (tiempoActual % 300) < 150 ? HIGH : LOW);
  } else {
    if(alarmaGasActiva) {
      alarmaGasActiva = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
  
  // ALARMA DE DISTANCIA (solo si no hay alarma de gas)
  if(distanciaCritica && !gasCritico) {
    if(!alarmaDistanciaActiva) {
      alarmaDistanciaActiva = true;
      inicioAlarmaDistancia = tiempoActual;
    }
    
    // Sonar por 2 segundos
    if(tiempoActual - inicioAlarmaDistancia < 2000) {
      digitalWrite(BUZZER_PIN, (tiempoActual % 500) < 250 ? HIGH : LOW);
    } else {
      digitalWrite(BUZZER_PIN, LOW);
      alarmaDistanciaActiva = false;
    }
  } else if(!distanciaCritica) {
    alarmaDistanciaActiva = false;
  }
  
  // ALARMA DE SUELO (solo si no hay otras alarmas)
  if(sueloMuySeco && !gasCritico && !alarmaDistanciaActiva) {
    if(!alarmaSueloActiva) {
      alarmaSueloActiva = true;
      inicioAlarmaSuelo = tiempoActual;
    }
    // Pitido lento
    digitalWrite(BUZZER_PIN, (tiempoActual % 1500) < 200 ? HIGH : LOW);
  } else {
    if(alarmaSueloActiva && !sueloMuySeco) {
      alarmaSueloActiva = false;
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
}

void probarTodosSensores() {
  Serial.println(F("🧪 Probando todos los sensores..."));
  
  // Probar DHT11
  Serial.print(F("🌡️ DHT11: "));
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  
  if(isnan(h) || isnan(t)) {
    Serial.println(F("❌ Sin respuesta (verificar pin 3)"));
  } else {
    Serial.print(F("✅ OK - "));
    Serial.print(t);
    Serial.print(F("°C, "));
    Serial.print(h);
    Serial.println(F("%"));
  }
  
  // Probar Ultrasónico
  Serial.print(F("📏 HC-SR04: "));
  float dist = leerDistancia();
  if(dist < 0) {
    Serial.println(F("❌ Sin respuesta (verificar pins 4/5)"));
  } else {
    Serial.print(F("✅ OK - "));
    Serial.print(dist);
    Serial.println(F(" cm"));
  }
  
  // Probar sensor de suelo
  Serial.print(F("🌱 YL-69: "));
  int suelo = leerHumedadSuelo();
  Serial.print(F("✅ OK - "));
  Serial.print(suelo);
  Serial.println(F("% humedad"));
  
  // Probar MQ-135
  Serial.print(F("💨 MQ-135: "));
  int gas = leerGasPromedio();
  Serial.print(F("✅ OK - Valor: "));
  Serial.println(gas);
  
  // Probar buzzer
  Serial.print(F("🔊 Buzzer: "));
  digitalWrite(BUZZER_PIN, HIGH);
  delay(200);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println(F("✅ OK"));
  
  Serial.println(F("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
}

// COMANDOS SERIE ADICIONALES (Para depuración)
void serialEvent() {
  if (Serial.available()) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();
    
    if(comando == "STATUS") {
      Serial.println(F("Sistema funcionando correctamente"));
      Serial.print(F("Referencia gas: "));
      Serial.println(valorReferencia);
      Serial.print(F("Uptime: "));
      Serial.print(millis() / 1000);
      Serial.println(F(" segundos"));
    }
    else if(comando == "CALIBRAR") {
      Serial.println(F("Recalibrando sensor de gas..."));
      calibrarSensorGas();
    }
    else if(comando == "TEST") {
      probarTodosSensores();
    }
    else if(comando.startsWith("BUZZER")) {
      Serial.println(F("Probando buzzer 3 segundos..."));
      unsigned long inicio = millis();
      while(millis() - inicio < 3000) {
        digitalWrite(BUZZER_PIN, (millis() % 500) < 250 ? HIGH : LOW);
      }
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println(F("Buzzer test completado"));
    }
  }
}
