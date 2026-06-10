<?php
/**
 * =============================================================================
 * Zap Negócios — tasks.php
 * =============================================================================
 * API de tarefas, lembretes e notificações vinculadas ao lead.
 * =============================================================================
 */

require __DIR__ . '/db.php';

sendCors();
$currentUser = requireUser('viewer');

function ensureTaskTable()
{
    if (!tableExists('lead_tasks')) {
        http_response_code(503);
        echo json_encode([
            'success' => false,
            'message' => 'Execute migrate_v6.sql no servidor para ativar tarefas e lembretes.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function denyTaskPermission()
{
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Permissão insuficiente para esta ação.'], JSON_UNESCAPED_UNICODE);
    exit;
}

function readTaskPayload()
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'JSON inválido.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $data;
}

function normalizeTaskPriority($priority)
{
    $priority = strtolower(trim((string) $priority));
    return in_array($priority, ['baixa', 'normal', 'alta'], true) ? $priority : 'normal';
}

function normalizeTaskDateTime($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return null;
    }

    $value = str_replace('T', ' ', $value);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        $value .= ' 00:00';
    }
    if (preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $value)) {
        $value .= ':00';
    }

    $date = DateTime::createFromFormat('Y-m-d H:i:s', $value);
    $errors = DateTime::getLastErrors();
    $hasDateErrors = is_array($errors)
        && (!empty($errors['warning_count']) || !empty($errors['error_count']));

    if (!$date || $hasDateErrors) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Data e hora da tarefa inválidas.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $date->format('Y-m-d H:i:s');
}

function getTaskContextFromArray($data)
{
    $conversationId = trim($data['conversation_id'] ?? '');
    $leadPhone = normalizeLeadPhone($data['lead_phone'] ?? '');
    $leadName = trim((string) ($data['lead_name'] ?? ''));
    $sourcePlatform = normalizeSourcePlatform($data['source_platform'] ?? 'travel_flow');
    $sourceConversationId = trim($data['source_conversation_id'] ?? $conversationId);

    return [
        'conversation_id' => $conversationId,
        'lead_phone' => $leadPhone,
        'lead_name' => $leadName,
        'source_platform' => $sourcePlatform,
        'source_conversation_id' => $sourceConversationId,
    ];
}

function buildTaskIdentityWhere($context, $alias = 't')
{
    $where = [];
    $params = [];
    $prefix = $alias ? $alias . '.' : '';

    if ($context['conversation_id'] !== '') {
        $where[] = "{$prefix}conversation_id = :conversation_id";
        $params['conversation_id'] = $context['conversation_id'];
    }

    if ($context['lead_phone'] !== '') {
        $where[] = "{$prefix}lead_phone = :lead_phone";
        $params['lead_phone'] = $context['lead_phone'];
    }

    if (
        $context['source_platform'] === 'whatsapp_web'
        && $context['lead_phone'] === ''
        && $context['lead_name'] !== ''
        && strlen($context['lead_name']) >= 3
    ) {
        $where[] = "{$prefix}lead_name = :lead_name";
        $params['lead_name'] = $context['lead_name'];
    }

    if ($context['source_conversation_id'] !== '') {
        $where[] = "({$prefix}source_platform = :source_platform AND {$prefix}source_conversation_id = :source_conversation_id)";
        $params['source_platform'] = $context['source_platform'];
        $params['source_conversation_id'] = $context['source_conversation_id'];
    }

    if (empty($where)) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => 'Informe conversation_id, lead_phone ou source_conversation_id.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return [$where, $params];
}

function addTaskUserScope(&$where, &$params, $currentUser, $alias = 't')
{
    if (userHasRole($currentUser, 'admin')) {
        return;
    }

    $prefix = $alias ? $alias . '.' : '';
    $where[] = "({$prefix}assigned_user_id = :task_scope_user_id OR {$prefix}created_by_user_id = :task_scope_user_id)";
    $params['task_scope_user_id'] = (int) $currentUser['id'];
}

function fetchTaskForContext($id, $context, $currentUser)
{
    [$identityWhere, $params] = buildTaskIdentityWhere($context, 't');
    $scopeWhere = [];
    $params['id'] = (int) $id;
    addTaskUserScope($scopeWhere, $params, $currentUser, 't');

    $sql = "
        SELECT t.*
        FROM lead_tasks t
        WHERE t.id = :id
          AND (" . implode(' OR ', $identityWhere) . ")
    ";

    if ($scopeWhere) {
        $sql .= ' AND ' . implode(' AND ', $scopeWhere);
    }

    $sql .= ' LIMIT 1';

    $stmt = getDb()->prepare($sql);
    $stmt->execute($params);
    $task = $stmt->fetch();

    if (!$task) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Tarefa não encontrada.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $task;
}

function fetchTaskById($id)
{
    $stmt = getDb()->prepare('SELECT * FROM lead_tasks WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => (int) $id]);
    return $stmt->fetch();
}

function getUserDisplayName($user)
{
    return trim((string) ($user['full_name'] ?? '')) !== ''
        ? trim((string) $user['full_name'])
        : trim((string) ($user['username'] ?? ''));
}

function resolveTaskAssignee($assignedUserId, $currentUser)
{
    if (!userHasRole($currentUser, 'admin')) {
        return $currentUser;
    }

    $assignedUserId = (int) $assignedUserId;
    if ($assignedUserId <= 0) {
        $assignedUserId = (int) $currentUser['id'];
    }

    $stmt = getDb()->prepare("
        SELECT id, username, full_name, role, is_active
        FROM zap_users
        WHERE id = :id
        LIMIT 1
    ");
    $stmt->execute(['id' => $assignedUserId]);
    $user = $stmt->fetch();

    if (!$user || (int) $user['is_active'] !== 1) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'Responsável da tarefa inválido ou inativo.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $user;
}

function ensureNegocioBelongsToContext($negocioId, $context)
{
    $negocioId = (int) $negocioId;
    if ($negocioId <= 0) {
        return null;
    }

    [$where, $params] = buildTaskIdentityWhere($context, 'n');
    $params['id'] = $negocioId;

    $stmt = getDb()->prepare("
        SELECT n.id
        FROM lead_negocios n
        WHERE n.id = :id
          AND (" . implode(' OR ', $where) . ")
        LIMIT 1
    ");
    $stmt->execute($params);

    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Negócio vinculado não pertence a este lead.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    return $negocioId;
}

function taskSelectSql()
{
    return "
        SELECT
            t.*,
            n.destino AS negocio_destino,
            n.nome_lead AS negocio_nome_lead,
            au.username AS assigned_username,
            au.full_name AS assigned_full_name
        FROM lead_tasks t
        LEFT JOIN lead_negocios n ON n.id = t.negocio_id
        LEFT JOIN zap_users au ON au.id = t.assigned_user_id
    ";
}

ensureTaskTable();

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = $_GET['action'] ?? 'list';

        if ($action === 'reminders') {
            $minutes = max(0, min(1440, (int) ($_GET['minutes'] ?? 15)));
            $where = [
                "t.status = 'pendente'",
                't.due_at IS NOT NULL',
                "t.due_at <= DATE_ADD(NOW(), INTERVAL {$minutes} MINUTE)",
                't.due_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)',
            ];
            $params = [];
            addTaskUserScope($where, $params, $currentUser, 't');

            $stmt = getDb()->prepare(taskSelectSql() . '
                WHERE ' . implode(' AND ', $where) . "
                ORDER BY t.due_at ASC, t.id ASC
                LIMIT 50
            ");
            $stmt->execute($params);

            echo json_encode([
                'success' => true,
                'tasks' => $stmt->fetchAll(),
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if ($action === 'overview') {
            $limit = max(20, min(500, (int) ($_GET['limit'] ?? 200)));
            $includeArchived = !empty($_GET['include_archived']) && userHasRole($currentUser, 'admin');
            $status = strtolower(trim((string) ($_GET['status'] ?? '')));
            $where = [];
            $params = [];

            if (!$includeArchived) {
                $where[] = "t.status <> 'arquivada'";
            }

            if ($status !== '' && in_array($status, ['pendente', 'concluida', 'cancelada', 'arquivada'], true)) {
                $where[] = 't.status = :status';
                $params['status'] = $status;
            }

            addTaskUserScope($where, $params, $currentUser, 't');

            $sql = taskSelectSql() . '
                WHERE ' . ($where ? implode(' AND ', $where) : '1 = 1') . "
                ORDER BY
                    FIELD(t.status, 'pendente', 'concluida', 'cancelada', 'arquivada'),
                    t.due_at IS NULL,
                    t.due_at ASC,
                    t.updated_at DESC,
                    t.id DESC
                LIMIT {$limit}
            ";

            $stmt = getDb()->prepare($sql);
            $stmt->execute($params);

            echo json_encode([
                'success' => true,
                'tasks' => $stmt->fetchAll(),
                'scope' => userHasRole($currentUser, 'admin') ? 'all' : 'own',
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $context = getTaskContextFromArray($_GET);
        [$where, $params] = buildTaskIdentityWhere($context, 't');
        $includeArchived = !empty($_GET['include_archived']) && userHasRole($currentUser, 'admin');
        $scopeWhere = [];
        addTaskUserScope($scopeWhere, $params, $currentUser, 't');

        $sql = taskSelectSql() . "
            WHERE (" . implode(' OR ', $where) . ")
        ";

        if ($scopeWhere) {
            $sql .= ' AND ' . implode(' AND ', $scopeWhere);
        }

        if (!$includeArchived) {
            $sql .= " AND t.status <> 'arquivada'";
        }

        $sql .= "
            ORDER BY
                FIELD(t.status, 'pendente', 'concluida', 'cancelada', 'arquivada'),
                t.due_at IS NULL,
                t.due_at ASC,
                t.id DESC
        ";

        $stmt = getDb()->prepare($sql);
        $stmt->execute($params);

        echo json_encode([
            'success' => true,
            'tasks' => $stmt->fetchAll(),
            'scope' => userHasRole($currentUser, 'admin') ? 'all' : 'own',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = readTaskPayload();
    $action = $data['action'] ?? 'create';

    if (in_array($action, ['create', 'update', 'complete', 'reopen', 'cancel'], true) && !userHasRole($currentUser, 'editor')) {
        denyTaskPermission();
    }
    if (in_array($action, ['archive', 'delete'], true) && !userHasRole($currentUser, 'admin')) {
        denyTaskPermission();
    }

    $context = getTaskContextFromArray($data);
    $db = getDb();

    if ($action === 'create' || $action === 'update') {
        $title = trim((string) ($data['title'] ?? ''));
        if ($title === '') {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'Informe o título da tarefa.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $notes = trim((string) ($data['notes'] ?? ''));
        $dueAt = normalizeTaskDateTime($data['due_at'] ?? '');
        $priority = normalizeTaskPriority($data['priority'] ?? 'normal');
        $responsavel = trim((string) ($data['responsavel'] ?? ''));
        $assignedUser = resolveTaskAssignee($data['assigned_user_id'] ?? 0, $currentUser);
        if ($responsavel === '') {
            $responsavel = getUserDisplayName($assignedUser);
        }
        $negocioId = ensureNegocioBelongsToContext((int) ($data['negocio_id'] ?? 0), $context);
        $leadName = trim((string) ($data['lead_name'] ?? ''));

        if ($action === 'create') {
            $stmt = $db->prepare("
                INSERT INTO lead_tasks (
                    conversation_id,
                    source_platform,
                    source_conversation_id,
                    lead_name,
                    lead_phone,
                    negocio_id,
                    title,
                    notes,
                    due_at,
                    priority,
                    status,
                    responsavel,
                    assigned_user_id,
                    created_by_user_id,
                    updated_by_user_id
                ) VALUES (
                    :conversation_id,
                    :source_platform,
                    :source_conversation_id,
                    :lead_name,
                    :lead_phone,
                    :negocio_id,
                    :title,
                    :notes,
                    :due_at,
                    :priority,
                    'pendente',
                    :responsavel,
                    :assigned_user_id,
                    :created_by_user_id,
                    :updated_by_user_id
                )
            ");
            $stmt->execute([
                'conversation_id' => $context['conversation_id'],
                'source_platform' => $context['source_platform'],
                'source_conversation_id' => $context['source_conversation_id'],
                'lead_name' => $leadName,
                'lead_phone' => $context['lead_phone'],
                'negocio_id' => $negocioId,
                'title' => $title,
                'notes' => $notes,
                'due_at' => $dueAt,
                'priority' => $priority,
                'responsavel' => $responsavel,
                'assigned_user_id' => (int) $assignedUser['id'],
                'created_by_user_id' => (int) $currentUser['id'],
                'updated_by_user_id' => (int) $currentUser['id'],
            ]);
            $newId = (int) $db->lastInsertId();
            logAudit($currentUser, 'task.create', 'lead_tasks', $newId, null, fetchTaskById($newId));

            echo json_encode([
                'success' => true,
                'message' => 'Tarefa criada com sucesso.',
                'id' => $newId,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $id = (int) ($data['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'message' => 'id é obrigatório.'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $before = fetchTaskForContext($id, $context, $currentUser);

        $stmt = $db->prepare("
            UPDATE lead_tasks
            SET
                lead_name = :lead_name,
                lead_phone = :lead_phone,
                negocio_id = :negocio_id,
                title = :title,
                notes = :notes,
                due_at = :due_at,
                priority = :priority,
                responsavel = :responsavel,
                assigned_user_id = :assigned_user_id,
                updated_by_user_id = :updated_by_user_id
            WHERE id = :id
        ");
        $stmt->execute([
            'lead_name' => $leadName,
            'lead_phone' => $context['lead_phone'],
            'negocio_id' => $negocioId,
            'title' => $title,
            'notes' => $notes,
            'due_at' => $dueAt,
            'priority' => $priority,
            'responsavel' => $responsavel,
            'assigned_user_id' => (int) $assignedUser['id'],
            'updated_by_user_id' => (int) $currentUser['id'],
            'id' => $id,
        ]);
        logAudit($currentUser, 'task.update', 'lead_tasks', $id, $before, fetchTaskById($id));

        echo json_encode([
            'success' => true,
            'message' => 'Tarefa atualizada com sucesso.',
            'id' => $id,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'message' => 'id é obrigatório.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $before = fetchTaskForContext($id, $context, $currentUser);

    if ($action === 'complete') {
        $stmt = $db->prepare("
            UPDATE lead_tasks
            SET status = 'concluida',
                completed_at = NOW(),
                canceled_at = NULL,
                archived_at = NULL,
                updated_by_user_id = :user_id
            WHERE id = :id
        ");
        $stmt->execute(['user_id' => (int) $currentUser['id'], 'id' => $id]);
        logAudit($currentUser, 'task.complete', 'lead_tasks', $id, $before, fetchTaskById($id));
        echo json_encode(['success' => true, 'message' => 'Tarefa concluída.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'reopen') {
        $stmt = $db->prepare("
            UPDATE lead_tasks
            SET status = 'pendente',
                completed_at = NULL,
                canceled_at = NULL,
                archived_at = NULL,
                updated_by_user_id = :user_id
            WHERE id = :id
        ");
        $stmt->execute(['user_id' => (int) $currentUser['id'], 'id' => $id]);
        logAudit($currentUser, 'task.reopen', 'lead_tasks', $id, $before, fetchTaskById($id));
        echo json_encode(['success' => true, 'message' => 'Tarefa reaberta.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'cancel') {
        $stmt = $db->prepare("
            UPDATE lead_tasks
            SET status = 'cancelada',
                canceled_at = NOW(),
                completed_at = NULL,
                archived_at = NULL,
                updated_by_user_id = :user_id
            WHERE id = :id
        ");
        $stmt->execute(['user_id' => (int) $currentUser['id'], 'id' => $id]);
        logAudit($currentUser, 'task.cancel', 'lead_tasks', $id, $before, fetchTaskById($id));
        echo json_encode(['success' => true, 'message' => 'Tarefa cancelada.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'archive') {
        $stmt = $db->prepare("
            UPDATE lead_tasks
            SET status = 'arquivada',
                archived_at = NOW(),
                updated_by_user_id = :user_id
            WHERE id = :id
        ");
        $stmt->execute(['user_id' => (int) $currentUser['id'], 'id' => $id]);
        logAudit($currentUser, 'task.archive', 'lead_tasks', $id, $before, fetchTaskById($id));
        echo json_encode(['success' => true, 'message' => 'Tarefa arquivada.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'delete') {
        $stmt = $db->prepare('DELETE FROM lead_tasks WHERE id = :id');
        $stmt->execute(['id' => $id]);
        logAudit($currentUser, 'task.delete_hard', 'lead_tasks', $id, $before, null);
        echo json_encode(['success' => true, 'message' => 'Tarefa excluída permanentemente.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(422);
    echo json_encode(['success' => false, 'message' => 'Ação inválida.'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erro ao processar tarefas.',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
