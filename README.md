# Especificação e Implementação — Sistema MES Modernizado (Caso SKA) 
# IOT-MES-TELEMETRY-SERVICE

**Autores:** <br />
 - Rosival de Souza <br />
 - Felipe Griep <br />
 - Giulia Mendes <br />
 - Tiago Zardin <br />

**Disciplina:** Engenharia de Software — Pós‑Graduação UNISINOS  

---

## 1. Resumo
Este trabalho especifica e implementa uma funcionalidade de coleta e disponibilização de dados de máquinas para cálculo simplificado do indicador OEE (Overall Equipment Effectiveness) em um sistema MES distribuído. As decisões de projeto priorizam escalabilidade, integração com dispositivos IoT e compliance com LGPD.

## 2. Requisitos e objetivo da funcionalidade
**Objetivo:** Implementar um *Data Collector* distribuído que recebe mensagens de dispositivos IoT (sensores ou emuladores), persiste os eventos e expõe um endpoint REST para consulta de métricas (incluindo cálculo simplificado de OEE).

Requisitos funcionais principais:
- Receber dados de produção em tempo real (via broker MQTT).
- Persistir eventos (timestamp, machineId, status, cycleTime).
- Expor API REST para consulta por máquina e período.
- Calcular OEE simplificado a partir das informações coletadas.

Requisitos não‑funcionais:
- Escalabilidade horizontal (vários collectors assinando tópicos diferentes ou em cluster).
- Robustez — tolerância a desconexões de sensores.
- Segurança: transporte via TLS opcional no broker; autenticação da API via token simples (implementação demo).
- Conformidade LGPD: minimização de dados pessoais (coletamos apenas identificadores de máquina — sem identificadores de operadores neste protótipo).

## 3. Arquitetura proposta
**Padrão arquitetural:** Microserviços com *Broker* (mensageria) + APIs REST.

Componentes:
- **Dispositivo IoT / Emulador** — publica eventos via MQTT.
- **Broker MQTT** (ex.: Mosquitto, EMQX) — middleware para marshaling simples (mensagens JSON).
- **Collector Service** — microserviço (Node.js/TypeScript) que subscreve tópicos MQTT, valida e persiste eventos em base (SQLite para demo; cloud DB para produção).
- **API Gateway / REST** — mesmo Collector expõe REST para consultas e integrações com módulo de análise.
- **Dashboard / Analytics** — componente de leitura que consome a API para visualização.

**Justificativa:** Broker MQTT é amplamente usado em IoT pela leveza e suporte a QoS; microserviços permitem modularidade e escalabilidade; REST é facilmente integrado a dashboards e outros módulos.

## 4. Marshaling / Unmarshaling
Formato escolhido: **JSON** (UTF‑8) em payload das mensagens MQTT.
- **Marshaling:** o dispositivo constrói objeto JSON com campos mínimos: `{ "machineId": "M01", "timestamp": 169..., "status": "RUN|STOP|SETUP", "cycleTimeMs": 1200 }`.
- **Unmarshaling:** Collector valida esquema JSON (campos obrigatórios, tipagem) e transforma em objeto interno antes de persistir.

**Justificativa:** JSON é legível, interoperável e suficiente para mensagens de telemetria simples. Em cenários com alto volume e necessidade de compactação, considerar CBOR/Protobuf.

## 5. Paradigma de comunicação
- **Comunicação indireta baseada em publicação/assinatura (pub/sub)** via MQTT para dados de telemetria.
- **Comunicação síncrona (request‑response)** via REST para consultas ad‑hoc, relatórios e operações de controle.

**Justificativa:** Pub/sub desacopla produtores e consumidores, melhora escalabilidade e tolerância à falhas; REST é excelente para integração com módulos de análise e UIs.

## 6. Exclusão mútua distribuída
Para a funcionalidade implementada (inserção de eventos e leitura de métricas) **não** há necessidade de exclusão mútua estrita: inserções são idempotentes por design (cada evento tem timestamp e id) e leituras são estatísticas.

Caso se estenda o sistema para operações concorrentes que atualizem um recurso único (ex.: mudança de estado global da linha ou alocação exclusiva de uma máquina), recomenda‑se uso de locks distribuídos via **Redis (Redlock)** ou serviços de coordenação como **ZooKeeper/etcd**.

## 7. Especificação da API (endpoints principais)
- `POST /events` — (opcional) ingestão direta via HTTP (JSON).
- `GET /machines/{id}/oee?from=...&to=...` — retorna OEE simplificado e métricas (availability, performance, quality) no período.
- `GET /machines/{id}/events?limit=100` — eventos recentes.

Formato das respostas: JSON, paginadas quando aplicável.

## 8. Segurança e LGPD
- **Minimização:** não armazenar dados pessoais no protótipo.
- **Transporte seguro:** suportar TLS para REST e broker (configurável).
- **Autenticação:** token bearer para API (demo); em produção, OAuth2 / mTLS.

## 9. Implementação (descrição)
A implementação entregue atende ao que foi especificado:
- Um *Sensor emulator* publica mensagens MQTT que simulam produção e paradas.
- O *Collector* subscreve tópicos, faz validação e persiste eventos em SQLite (arquivo local).
- Expõe endpoint REST `/machines/:id/oee` que calcula OEE simplificado: OEE = Availability * Performance * Quality, onde:
  - Availability = uptime / plannedTime (simplificado com base em status RUN vs STOP),
  - Performance = (idealCycleTime * producedUnits) / actualRunTime,
  - Quality = (goodUnits / producedUnits).

## 10. Justificativas das escolhas (sumário)
- MQTT: apropriado para IoT leve e cenários com latência/uso reduzido de bandwidth.
- JSON: interoperabilidade e simplicidade para protótipo.
- SQLite: simplicidade para entrega e avaliação; em produção migrar para timeseries DB (InfluxDB) ou cloud SQL.
- REST + Pub/Sub: combinações comprovadas para MES distribuídos.

## 11. Como testar / demonstrar (video)
1. Subir broker (Docker: eclipse-mosquitto).  
2. Iniciar Collector (`npm run start`) — subscreve tópicos.  
3. Iniciar Sensor emulator — publica eventos.  
4. Usar `curl` para consultar `/machines/M01/oee` (`curl http://localhost:3000/machines/M01/oee`).  
5. Gravar tela mostrando logs do collector, publicação de eventos e resposta do endpoint.

---

**Anexos (código e instruções de execução) estão no repositório e serão entregues junto ao relatório.**

(Fim do relatório — 4 páginas quando formatado com o template SBC.)

