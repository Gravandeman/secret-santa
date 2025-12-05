// API функции
const API = {
    baseUrl: '',
    
    
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(endpoint, {
                ...options,
                headers
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка сервера');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    // Авторизация
    async login(email, password) {
        return this.request('/api/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },
    
    async register(name, email, password) {
        return this.request('/api/register', {
            method: 'POST',
            body: JSON.stringify({ name, email, password })
        });
    },
    
    async logout() {
        try {
            await this.request('/api/logout', { method: 'POST' });
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
    },
    
    async checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) return { authenticated: false };
        
        try {
            return await this.request('/api/check-auth');
        } catch {
            return { authenticated: false };
        }
    },
    
    // Группы
    async createGroup(groupData) {
        return this.request('/api/groups', {
            method: 'POST',
            body: JSON.stringify(groupData)
        });
    },
    
    async searchGroups(query = '') {
        return this.request(`/api/groups/search?query=${encodeURIComponent(query)}`);
    },
    
    async joinGroup(code, password = '') {
        return this.request('/api/groups/join', {
            method: 'POST',
            body: JSON.stringify({ code, password })
        });
    },
    
    async getUserGroups() {
        return this.request('/api/user/groups');
    },
    
    async getGroup(groupId) {
        return this.request(`/api/groups/${groupId}`);
    },
    
    async getGroupByCode(code) {
        return this.request(`/api/groups/code/${code}`);
    },
    
    // Списки желаний
    async saveWishlist(groupId, items) {
        return this.request('/api/wishlist', {
            method: 'POST',
            body: JSON.stringify({ groupId, items })
        });
    },
    
    async getWishlist(groupId) {
        return this.request(`/api/wishlist/${groupId}`);
    },

    // Жеребьевка
    async drawGroup(groupId) {
        return this.request(`/api/groups/${groupId}/draw`, {
            method: 'POST'
        });
    },

    async getReceiver(groupId) {
        return this.request(`/api/groups/${groupId}/receiver`);
    },

    // Получение списка желаний
    async getWishlist(groupId) {
        return this.request(`/api/wishlist/${groupId}`);
    },

    // Получение всех назначений (только для админа)
    async getAllAssignments(groupId) {
        return this.request(`/api/groups/${groupId}/assignments`);
    }
};

// Утилиты
const Utils = {
    // Форматирование даты
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    },
    
    // Генерация аватара
    getAvatar(name) {
        return name ? name.charAt(0).toUpperCase() : '?';
    },
    
    // Создание элемента
    createElement(tag, className, text = '') {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
    },
    
    // Показать уведомление
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification`;
        notification.style.background = type === 'error' ? '#FF6B6B' : '#4ECDC4';
        notification.style.color = 'white';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },
    
    // Копирование текста
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('Скопировано!');
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('Скопировано!');
        }
    },
    
    // Показать/скрыть пароль
    togglePassword(inputId) {
        const input = document.getElementById(inputId);
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    }
};

// Инициализация страницы
document.addEventListener('DOMContentLoaded', async () => {
    // Проверка авторизации для защищенных страниц
    const protectedPages = ['dashboard', 'create-group', 'group', 'wishlist'];
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    
    if (protectedPages.includes(currentPage)) {
        const auth = await API.checkAuth();
        if (!auth.authenticated) {
            window.location.href = 'login.html';
        } else {
            // Сохраняем пользователя
            localStorage.setItem('user', JSON.stringify(auth.user));
            localStorage.setItem('token', auth.token);
            
            // Показываем имя пользователя
            const userElements = document.querySelectorAll('[data-user-name]');
            userElements.forEach(el => {
                el.textContent = auth.user.name;
            });
        }
    }
    
    // Инициализация мобильного меню
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navbarMenu = document.querySelector('.navbar-menu');
    
    if (mobileMenuBtn && navbarMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            navbarMenu.classList.toggle('active');
        });
    }
    
    // Обработчики форм
    initForms();
});

// Инициализация форм
function initForms() {
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = 'Загрузка...';
                submitBtn.disabled = true;
                
                try {
                    const formData = new FormData(form);
                    const data = Object.fromEntries(formData.entries());
                    
                    // Вызываем обработчик формы, если он есть
                    if (window.handleFormSubmit) {
                        await window.handleFormSubmit(form.id, data);
                    }
                } catch (error) {
                    Utils.showNotification(error.message || 'Произошла ошибка', 'error');
                } finally {
                    if (submitBtn) {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                    }
                }
            }
        });
    });
}

// Экспортируем API и утилиты
window.API = API;
window.Utils = Utils;