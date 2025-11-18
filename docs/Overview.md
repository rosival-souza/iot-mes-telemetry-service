Visão geral

A aplicação é um microserviço Collector para um cenário de MES (Manufacturing Execution System) simplificado. Ela recebe telemetria de máquinas (via MQTT), valida e armazena eventos em um banco leve (SQLite) e expõe uma API REST para consulta de métricas por máquina — incluindo um cálculo simplificado de OEE (Overall Equipment Effectiveness). Há também um emulador de sensor que publica mensagens MQTT para simular máquinas.

Componentes principais e responsabilidades

Sensor Emulator

Publica periodicamente mensagens no broker MQTT representando eventos de uma máquina (por exemplo: status RUN ou STOP, tempo de ciclo, unidades boas).

É usado para demonstração e testes; na prática seria substituído por um gateway IoT ou firmware de máquina.

Broker MQTT (Mosquitto no demo)

Middleware pub/sub que recebe as mensagens dos sensores e as encaminha para consumidores inscritos (Collectors).

Permite desacoplamento entre produtores (sensores) e consumidores (collector services).

Collector Service (Node.js/TypeScript)

Conecta-se ao broker e subscreve tópicos (por exemplo ska/machine/+/metrics).

Ao receber cada mensagem:

Faz unmarshaling do JSON e valida campos mínimos (machineId, timestamp).

Gera um id único e persiste o evento em SQLite.

Loga a recepção para debug/monitoramento.

Expõe endpoints REST para consulta:

/machines/:id/events → lista eventos recentes.

/machines/:id/oee?from=...&to=... → calcula e retorna OEE e sub-métricas no intervalo.

Banco de dados (SQLite no demo)

Armazena eventos com campos como id, machineId, timestamp, status, cycleTimeMs, goodUnits e raw (payload original).

Simples e persistente para um protótipo; em produção recomendaria timeseries DB (InfluxDB) ou SQL/NoSQL escalável.

Formato de mensagem (marshaling)

Mensagens trocadas via MQTT usam JSON (UTF-8).

Campos típicos:

machineId (string) — identificador da máquina.

timestamp (integer, ms) — quando o evento foi gerado.

status (RUN / STOP / SETUP) — estado operacional.

cycleTimeMs (integer) — tempo de ciclo em milissegundos (quando aplicável).

goodUnits (integer) — unidades boas geradas no ciclo (opcional).

Justificativa: JSON é simples, legível e suficiente para protótipos; pode migrar para Protobuf/CBOR se houver restrições de largura de banda ou necessidade de schema mais rígido.

Fluxo de dados (end-to-end)

Sensor → publica JSON no tópico MQTT correspondente (ska/machine/M01/metrics).

Broker → recebe e entrega a mensagem para todos os subscribers do tópico.

Collector → recebe, faz parse, valida, grava no DB e confirma (quando QoS apropriado).

Usuário/UI/Analytics → faz requisição HTTP à API REST do Collector para obter eventos ou OEE.

API calcula métricas a partir dos eventos persistidos e devolve JSON com resultados.

Cálculo do OEE (simplificado)

O OEE tradicional = Availability × Performance × Quality. Na implementação demo:

Availability

Simplificação: razão entre tempo em RUN (estimado a partir dos eventos) e tempo planejado no intervalo (plannedTimeMs = to - from).

availability = uptimeMs / plannedTimeMs (limitado a 1).

Performance

Simplificação: compara tempo ideal por unidade com o tempo real.

performance = (idealCycleMs * producedUnits) / actualRunTime (limitado a 1).

idealCycleMs é um parâmetro fixo (por exemplo 1000 ms) — em produção seria variável por modelo de máquina/peça.

Quality

quality = goodUnits / producedUnits.

OEE final = availability * performance * quality.

Exemplo numérico rápido:

intervalo plannedTime = 3600_000 ms (1 hora)

uptime estimado = 3_000_000 ms → availability ≈ 0.833

producedUnits = 200; idealCycle = 1000 ms; actualRunTime = 180_000 ms → performance ≈ min(1,(1000*200)/180000)=1.0

goodUnits = 190 → quality = 0.95
→ OEE ≈ 0.833 * 1.0 * 0.95 ≈ 0.792 (79.2%)

Observação: as fórmulas são simplificadas para demonstrar o pipeline; medições reais exigem contagem precisa de ciclos, janelas de tempo bem definidas e tratamento de eventos de paragem/partida.

Endpoints REST (o que você pode pedir)

GET /machines/:id/events?limit=N — retorna N eventos mais recentes para a máquina.

GET /machines/:id/oee?from=TS_MS&to=TS_MS — retorna o OEE calculado e componentes (availability, performance, quality), número de amostras, etc.

(Opcional no protótipo) POST /events — ingestão via HTTP (útil para integrações sem MQTT).

Resiliência e comportamento em falhas

Desconexão do broker: MQTT client do Collector tenta reconectar automaticamente (comportamento padrão do client); mensagens publicadas com QoS ≥1 no emissor garantem reentrega dependendo da configuração.

Mensagens inválidas: Collector faz validação mínima e descarta/loga payloads inválidos; em produção, colocar DLQ (dead-letter queue) para análise.

Falha do DB local: SQLite é local; em falha o Collector pode enfileirar em memória (temporário) ou reencaminhar para um buffer externo. Em produção, usar DB replicado ou serviço gerenciado.

Escalabilidade e evolução

Horizontal: múltiplos instances do Collector podem subscrever os mesmos tópicos ou particionar por tópico/machineId. Importante garantir idempotência das inserções (usar UUID + checagem) para evitar duplicação.

Persistência: migrar para timeseries DB (InfluxDB, Timescale) melhora consultas por janela temporal e retensão.

Coordenação/locks: para operações que exigem exclusão mútua (por exemplo alocação única de recurso), usar Redis Redlock ou etcd/ZooKeeper.

Compactação e schema: para alto volume, trocar JSON por Protobuf/CBOR; usar compressão.

Segurança & privacidade

Transporte: suportar TLS para MQTT e HTTPS para REST.

Autenticação/autorização: demo usa token simples; em produção usar OAuth2, mTLS, ou IAM.

LGPD: protótipo minimiza dados pessoais — armazena apenas machineId (sem identificador de operadores). Em uso real, aplicar anonimização e políticas de retenção.

Como testar / executar rapidamente

Levantar broker Mosquitto (docker).

Iniciar Collector (Node.js).

Iniciar Sensor Emulator (publica eventos).

Consultar GET /machines/M01/oee para verificar que eventos chegam e que o cálculo é retornado.

Ver logs do Collector para ver parsing, inserções e eventuais erros.

Limitações e pressupostos

O cálculo do OEE é didático e simplificado; para métricas aceitáveis em indústria é preciso dados de produção por unidade, paradas categorizadas, tempo planejado preciso e definição de unidade produzida.

SQLite e arquitetura atual são adequados para protótipo; não para produção de alto throughput.

O emulador gera eventos aleatórios; resultados devem ser interpretados como demonstração.