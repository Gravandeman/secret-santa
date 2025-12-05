const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs'); // Изменено здесь
const path = require('path');

const app = express();
const PORT = 3000;

// Создаем папку data если её нет
if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

// Инициализация файлов данных
async function initDataFiles() {
    const files = ['users.json', 'groups.json'];
    for (const file of files) {
        const filePath = path.join('data', file);
        try {
            await fs.promises.access(filePath); // Изменено здесь
        } catch {
            await fs.promises.writeFile(filePath, JSON.stringify([])); // Изменено здесь
        }
    }
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Сессии (простая реализация в памяти)
const sessions = new Map();

// Helper functions
async function readData(file) {
    const data = await fs.promises.readFile(path.join('data', file), 'utf8'); // Изменено здесь
    return JSON.parse(data);
}

async function writeData(file, data) {
    await fs.promises.writeFile(path.join('data', file), JSON.stringify(data, null, 2)); // Изменено здесь
}

// Middleware для проверки авторизации
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    req.user = sessions.get(token);
    req.token = token;
    next();
}

// ========== API ENDPOINTS ==========

// 1. Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Все поля обязательны' });
        }
        
        const users = await readData('users.json');
        
        if (users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email уже используется' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: uuidv4(),
            name,
            email,
            password: hashedPassword,
            wishlist: [],
            groups: [],
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        await writeData('users.json', users);
        
        const token = uuidv4();
        sessions.set(token, {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email
        });
        
        res.json({
            success: true,
            token,
            user: { id: newUser.id, name: newUser.name, email: newUser.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 2. Вход
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const users = await readData('users.json');
        const user = users.find(u => u.email === email);
        
        if (!user) {
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Неверный email или пароль' });
        }
        
        const token = uuidv4();
        sessions.set(token, {
            id: user.id,
            name: user.name,
            email: user.email
        });
        
        res.json({
            success: true,
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 3. Выход
app.post('/api/logout', requireAuth, (req, res) => {
    sessions.delete(req.token);
    res.json({ success: true });
});

// 4. Проверка токена
app.get('/api/check-auth', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token || !sessions.has(token)) {
        return res.json({ authenticated: false });
    }
    
    const user = sessions.get(token);
    res.json({
        authenticated: true,
        user: user,
        token: token
    });
});

// 5. Создание группы
app.post('/api/groups', requireAuth, async (req, res) => {
    try {
        const { name, description, password, maxParticipants, isPublic } = req.body;
        
        const groups = await readData('groups.json');
        
        // Генерируем код группы (6 символов)
        const generateCode = () => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };
        
        let code;
        do {
            code = generateCode();
        } while (groups.find(g => g.code === code));
        
        const newGroup = {
            id: uuidv4(),
            code,
            name,
            description: description || '',
            password: password ? await bcrypt.hash(password, 10) : null,
            isPublic: isPublic || false,
            maxParticipants: maxParticipants || 20,
            adminId: req.user.id,
            adminName: req.user.name,
            participants: [{
                userId: req.user.id,
                name: req.user.name,
                email: req.user.email,
                joinedAt: new Date().toISOString(),
                isAdmin: true,
                wishlist: []
            }],
            assignments: {},
            status: 'active', // active, completed
            createdAt: new Date().toISOString(),
            drawDate: null
        };
        
        groups.push(newGroup);
        await writeData('groups.json', groups);
        
        // Обновляем пользователя
        const users = await readData('users.json');
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            if (!users[userIndex].groups) users[userIndex].groups = [];
            if (!users[userIndex].groups.includes(newGroup.id)) {
                users[userIndex].groups.push(newGroup.id);
                await writeData('users.json', users);
            }
        }
        
        res.json({
            success: true,
            group: {
                id: newGroup.id,
                code: newGroup.code,
                name: newGroup.name,
                inviteLink: `http://localhost:${PORT}/join-group.html?code=${newGroup.code}`
            }
        });
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 6. Поиск публичных групп
app.get('/api/groups/search', requireAuth, async (req, res) => {
    try {
        const { query } = req.query;
        const groups = await readData('groups.json');
        
        let filteredGroups = groups.filter(group => 
            group.isPublic && 
            group.status === 'active' &&
            !group.participants.find(p => p.userId === req.user.id) &&
            group.participants.length < group.maxParticipants
        );
        
        if (query) {
            filteredGroups = filteredGroups.filter(group => 
                group.name.toLowerCase().includes(query.toLowerCase()) ||
                group.code.toLowerCase().includes(query.toLowerCase())
            );
        }
        
        res.json({
            groups: filteredGroups.map(g => ({
                id: g.id,
                code: g.code,
                name: g.name,
                description: g.description,
                participantsCount: g.participants.length,
                maxParticipants: g.maxParticipants,
                isPasswordProtected: !!g.password,
                adminName: g.adminName
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 7. Вступление в группу
app.post('/api/groups/join', requireAuth, async (req, res) => {
    try {
        const { code, password } = req.body;
        
        const groups = await readData('groups.json');
        const groupIndex = groups.findIndex(g => g.code === code);
        
        if (groupIndex === -1) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        const group = groups[groupIndex];
        
        // Проверка пароля
        if (group.password && !password) {
            return res.status(400).json({ error: 'Требуется пароль' });
        }
        
        if (group.password && password) {
            const validPassword = await bcrypt.compare(password, group.password);
            if (!validPassword) {
                return res.status(400).json({ error: 'Неверный пароль' });
            }
        }
        
        // Проверяем, не участник ли уже
        if (group.participants.find(p => p.userId === req.user.id)) {
            return res.status(400).json({ error: 'Вы уже в этой группе' });
        }
        
        // Проверяем лимит
        if (group.participants.length >= group.maxParticipants) {
            return res.status(400).json({ error: 'Группа заполнена' });
        }
        
        // Проверяем статус
        if (group.status !== 'active') {
            return res.status(400).json({ error: 'Группа закрыта для вступления' });
        }
        
        // Добавляем участника
        group.participants.push({
            userId: req.user.id,
            name: req.user.name,
            email: req.user.email,
            joinedAt: new Date().toISOString(),
            isAdmin: false,
            wishlist: []
        });
        
        groups[groupIndex] = group;
        await writeData('groups.json', groups);
        
        // Обновляем пользователя
        const users = await readData('users.json');
        const userIndex = users.findIndex(u => u.id === req.user.id);
        if (userIndex !== -1) {
            if (!users[userIndex].groups) users[userIndex].groups = [];
            if (!users[userIndex].groups.includes(group.id)) {
                users[userIndex].groups.push(group.id);
                await writeData('users.json', users);
            }
        }
        
        res.json({
            success: true,
            group: {
                id: group.id,
                code: group.code,
                name: group.name
            }
        });
    } catch (error) {
        console.error('Join group error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 8. Получение групп пользователя
app.get('/api/user/groups', requireAuth, async (req, res) => {
    try {
        const groups = await readData('groups.json');
        const userGroups = groups.filter(group => 
            group.participants.find(p => p.userId === req.user.id)
        );
        
        res.json({
            groups: userGroups.map(g => ({
                id: g.id,
                code: g.code,
                name: g.name,
                description: g.description,
                participants: g.participants,
                participantsCount: g.participants.length,
                maxParticipants: g.maxParticipants,
                isAdmin: g.adminId === req.user.id,
                status: g.status,
                createdAt: g.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 9. Получение информации о группе
app.get('/api/groups/:groupId', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const groups = await readData('groups.json');
        const group = groups.find(g => g.id === groupId);
        
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        // Проверяем, участник ли
        const isParticipant = group.participants.find(p => p.userId === req.user.id);
        if (!isParticipant) {
            return res.status(403).json({ error: 'Нет доступа к группе' });
        }
        
        // Определяем получателя для текущего пользователя
        let myReceiver = null;
        if (group.status === 'completed' && group.assignments && group.assignments[req.user.id]) {
            const receiverInfo = group.assignments[req.user.id];
            const receiver = group.participants.find(p => p.userId === receiverInfo.userId);
            if (receiver) {
                myReceiver = {
                    name: receiver.name,
                    wishlist: receiver.wishlist || []
                };
            }
        }
        
        // Формируем список участников для отображения
        const participantsForDisplay = group.participants.map(p => ({
            userId: p.userId,
            name: p.name,
            isAdmin: p.isAdmin || false,
            hasWishlist: p.wishlist && p.wishlist.length > 0,
            wishlistCount: p.wishlist ? p.wishlist.length : 0
        }));
        
        res.json({
            success: true,
            group: {
                id: group.id,
                code: group.code,
                name: group.name,
                description: group.description,
                participants: participantsForDisplay,
                participantsCount: group.participants.length,
                maxParticipants: group.maxParticipants,
                isAdmin: group.adminId === req.user.id,
                status: group.status,
                drawDate: group.drawDate,
                myReceiver: myReceiver,
                createdAt: group.createdAt
            }
        });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 10. Обновление списка желаний
app.post('/api/wishlist', requireAuth, async (req, res) => {
    try {
        const { groupId, items } = req.body;
        
        if (!groupId) {
            return res.status(400).json({ error: 'ID группы обязателен' });
        }
        
        const groups = await readData('groups.json');
        const groupIndex = groups.findIndex(g => g.id === groupId);
        
        if (groupIndex === -1) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        const group = groups[groupIndex];
        
        // Находим участника и обновляем его список желаний
        const participantIndex = group.participants.findIndex(p => p.userId === req.user.id);
        if (participantIndex === -1) {
            return res.status(403).json({ error: 'Вы не участник этой группы' });
        }
        
        // Проверяем, что items это массив
        const wishlistItems = Array.isArray(items) ? items : [];
        
        group.participants[participantIndex].wishlist = wishlistItems;
        groups[groupIndex] = group;
        await writeData('groups.json', groups);
        
        console.log(`Список желаний обновлен для пользователя ${req.user.name} в группе ${group.name}`);
        
        res.json({ 
            success: true,
            message: 'Список желаний сохранен!'
        });
    } catch (error) {
        console.error('Wishlist error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
});

// 11. Проведение жеребьевки
app.post('/api/groups/:groupId/draw', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const groups = await readData('groups.json');
        const groupIndex = groups.findIndex(g => g.id === groupId);
        
        if (groupIndex === -1) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        const group = groups[groupIndex];
        
        // Проверяем права
        if (group.adminId !== req.user.id) {
            return res.status(403).json({ error: 'Только организатор может проводить жеребьевку' });
        }
        
        // Проверяем минимальное количество участников
        if (group.participants.length < 2) {
            return res.status(400).json({ error: 'Нужно минимум 2 участника' });
        }
        
        // Проводим жеребьевку
        const participants = [...group.participants];
        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        
        // Проверяем, чтобы никто не достался сам себе
        let valid = false;
        let assignments = {};
        let attempts = 0;
        const maxAttempts = 100;
        
        while (!valid && attempts < maxAttempts) {
            attempts++;
            valid = true;
            assignments = {};
            
            // Перемешиваем каждый раз
            shuffled.sort(() => Math.random() - 0.5);
            
            for (let i = 0; i < participants.length; i++) {
                const giver = participants[i].userId;
                const receiver = shuffled[i];
                
                if (giver === receiver.userId) {
                    valid = false;
                    break;
                }
                
                assignments[giver] = {
                    userId: receiver.userId,
                    name: receiver.name,
                    wishlist: receiver.wishlist || []
                };
            }
        }
        
        if (!valid) {
            return res.status(500).json({ error: 'Не удалось провести жеребьевку. Попробуйте еще раз.' });
        }
        
        group.assignments = assignments;
        group.status = 'completed';
        group.drawDate = new Date().toISOString();
        
        groups[groupIndex] = group;
        await writeData('groups.json', groups);
        
        // Формируем результаты для организатора
        const results = {};
        for (const [giverId, receiver] of Object.entries(assignments)) {
            const giver = group.participants.find(p => p.userId === giverId);
            if (giver) {
                results[giver.name] = receiver.name;
            }
        }
        
        res.json({ 
            success: true,
            message: 'Жеребьевка успешно проведена!',
            results: results
        });
    } catch (error) {
        console.error('Draw error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 12. Получение получателя
app.get('/api/groups/:groupId/receiver', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        const groups = await readData('groups.json');
        const group = groups.find(g => g.id === groupId);
        
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        if (group.status !== 'completed') {
            return res.status(400).json({ error: 'Жеребьевка еще не проведена' });
        }
        
        const receiverAssignment = group.assignments[req.user.id];
        if (!receiverAssignment) {
            return res.status(404).json({ error: 'Получатель не найден' });
        }
        
        // Находим полную информацию о получателе
        const receiver = group.participants.find(p => p.userId === receiverAssignment.userId);
        
        if (!receiver) {
            return res.status(404).json({ error: 'Информация о получателе не найдена' });
        }
        
        res.json({
            receiver: {
                name: receiver.name,
                wishlist: receiver.wishlist || []
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 13. Получение информации о группе по коду (публичный доступ)
app.get('/api/groups/code/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const groups = await readData('groups.json');
        const group = groups.find(g => g.code === code);
        
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        // Возвращаем только публичную информацию
        res.json({
            group: {
                id: group.id,
                code: group.code,
                name: group.name,
                description: group.description,
                participantsCount: group.participants.length,
                maxParticipants: group.maxParticipants,
                isPasswordProtected: !!group.password,
                status: group.status,
                adminName: group.adminName
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// 14. Получение списка желаний пользователя для группы
app.get('/api/wishlist/:groupId', requireAuth, async (req, res) => {
    try {
        const { groupId } = req.params;
        
        const groups = await readData('groups.json');
        const group = groups.find(g => g.id === groupId);
        
        if (!group) {
            return res.status(404).json({ error: 'Группа не найдена' });
        }
        
        // Находим участника
        const participant = group.participants.find(p => p.userId === req.user.id);
        if (!participant) {
            return res.status(403).json({ error: 'Вы не участник этой группы' });
        }
        
        res.json({
            success: true,
            wishlist: participant.wishlist || []
        });
    } catch (error) {
        console.error('Get wishlist error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Статические файлы
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, async () => {
    await initDataFiles();
    console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Сайт адаптирован для мобильных устройств`);
});