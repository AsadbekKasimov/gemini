
 * Система авторизации для Telegram Web App
 * Проверяет chat ID пользователя по Google Sheets
 * ИСПРАВЛЕНА ПРОБЛЕМА С ПОЛУЧЕНИЕМ CHAT_ID
 */

class TelegramAuth {
    constructor(config = null) {
        this.tg = window.Telegram.WebApp;
        
        // Используем конфигурацию из файла или переданную
        this.config = config || window.AUTH_CONFIG || {};
        
        // URL Google Sheets API
        this.googleSheetsUrl = this.config.GOOGLE_SHEETS_API_URL || 
            'https://script.google.com/macros/s/AKfycbyN_Gx2x1BQancouGsZxdh3GbyR-Iv7OuUsB954Mu1iWIJVCPd021zP-gYQwWF33pnk0A/exec';
        
        // Текущий язык
        this.language = this.config.CURRENT_LANGUAGE || 'RU';
        
        // Тексты сообщений
        this.messages = this.config.MESSAGES ? this.config.MESSAGES[this.language] : null;
        
        this.isAuthorized = false;
        this.userChatId = null;
        this.userData = null;
        this.retryCount = 0;
    }
    
    /**
     * Получить текст сообщения на текущем языке
     */
    getMessage(key, defaultValue = '') {
        if (this.messages && this.messages[key]) {
            return this.messages[key];
        }
        return defaultValue;
    }
    
    /**
     * Логирование
     */
    log(level, message, data = null) {
        const loggingConfig = this.config.LOGGING || { ENABLED: true, LEVEL: 'info' };
        
        if (!loggingConfig.ENABLED) return;
        
        const levels = ['error', 'warn', 'info', 'debug'];
        const currentLevelIndex = levels.indexOf(loggingConfig.LEVEL);
        const messageLevelIndex = levels.indexOf(level);
        
        if (messageLevelIndex <= currentLevelIndex) {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
            
            if (data) {
                console[level](`${prefix} ${message}`, data);
            } else {
                console[level](`${prefix} ${message}`);
            }
        }
    }

    /**
     * УЛУЧШЕННОЕ получение Chat ID пользователя
     * Пробует несколько способов получения данных
     */
    getUserChatId() {
        this.log('info', 'Попытка получить chat_id пользователя');
        
        // СПОСОБ 1: Из initDataUnsafe.user.id (стандартный)
        if (this.tg.initDataUnsafe?.user?.id) {
            const chatId = this.tg.initDataUnsafe.user.id;
            this.log('info', 'Chat ID получен из initDataUnsafe.user.id', chatId);
            return chatId;
        }
        
        // СПОСОБ 2: Из initDataUnsafe.user (без .id)
        if (this.tg.initDataUnsafe?.user) {
            const user = this.tg.initDataUnsafe.user;
            this.log('debug', 'Объект user:', user);
            
            // Пробуем разные варианты полей
            if (user.id) return user.id;
            if (user.chat_id) return user.chat_id;
            if (user.user_id) return user.user_id;
        }
        
        // СПОСОБ 3: Парсинг из initData (raw строка)
        if (this.tg.initData) {
            try {
                const params = new URLSearchParams(this.tg.initData);
                const userJson = params.get('user');
                if (userJson) {
                    const user = JSON.parse(userJson);
                    if (user.id) {
                        this.log('info', 'Chat ID получен из initData (raw)', user.id);
                        return user.id;
                    }
                }
            } catch (e) {
                this.log('warn', 'Ошибка парсинга initData', e);
            }
        }
        
        // СПОСОБ 4: Из URL параметров (если бот передает)
        const urlParams = new URLSearchParams(window.location.search);
        const chatIdFromUrl = urlParams.get('chat_id') || urlParams.get('user_id');
        if (chatIdFromUrl) {
            this.log('info', 'Chat ID получен из URL параметров', chatIdFromUrl);
            return chatIdFromUrl;
        }
        
        // СПОСОБ 5: Из глобальных переменных Telegram
        if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
            return window.Telegram.WebApp.initDataUnsafe.user.id;
        }
        
        this.log('error', 'Не удалось получить chat_id ни одним из способов');
        this.log('debug', 'Telegram WebApp данные:', {
            initDataUnsafe: this.tg.initDataUnsafe,
            initData: this.tg.initData,
            isVersionAtLeast: this.tg.isVersionAtLeast,
            platform: this.tg.platform
        });
        
        return null;
    }

    /**
     * Инициализация и проверка авторизации
     */
    async init() {
        try {
            this.log('info', 'Инициализация системы авторизации');
            this.log('info', 'Telegram WebApp version:', this.tg.version);
            this.log('info', 'Platform:', this.tg.platform);
            
            // Показываем loader
            this.showLoader();
            
            // Проверка режима разработки
            const devMode = this.config.DEVELOPMENT_MODE || {};
            if (devMode.ENABLED && devMode.SKIP_AUTH_CHECK) {
                this.log('warn', 'Режим разработки: пропуск проверки авторизации');
                this.isAuthorized = true;
                this.hideLoader();
                this.showApp();
                return true;
            }

            // Получаем данные пользователя из Telegram
            if (devMode.ENABLED && devMode.USE_TEST_CHAT_ID) {
                this.userChatId = devMode.TEST_CHAT_ID;
                this.log('warn', 'Режим разработки: используется тестовый chat ID', this.userChatId);
            } else {
                // ИСПОЛЬЗУЕМ УЛУЧШЕННУЮ ФУНКЦИЮ
                this.userChatId = this.getUserChatId();
            }

            if (!this.userChatId) {
                const errorMsg = this.getMessage('ERROR_NO_USER_DATA', 'Не удалось получить данные пользователя');
                this.log('error', errorMsg);
                this.log('error', 'Telegram WebApp полные данные:', this.tg);
                this.showError(errorMsg);
                return false;
            }
            
            this.log('info', 'Chat ID получен успешно:', this.userChatId);

            // Проверяем авторизацию
            const isAuth = await this.checkAuthorization(this.userChatId);

            if (isAuth) {
                this.isAuthorized = true;
                this.log('info', 'Пользователь успешно авторизован');
                this.hideLoader();
                this.showApp();
                return true;
            } else {
                this.log('warn', 'Доступ запрещен для пользователя', this.userChatId);
                this.showAccessDenied();
                return false;
            }

        } catch (error) {
            this.log('error', 'Ошибка инициализации', error);
            
            // Проверяем, нужно ли повторить попытку
            const retryConfig = this.config.RETRY || { ENABLED: true, MAX_ATTEMPTS: 3, DELAY: 2000 };
            
            if (retryConfig.ENABLED && this.retryCount < retryConfig.MAX_ATTEMPTS) {
                this.retryCount++;
                this.log('info', `Повторная попытка ${this.retryCount}/${retryConfig.MAX_ATTEMPTS}`);
                
                await new Promise(resolve => setTimeout(resolve, retryConfig.DELAY));
                return this.init();
            }
            
            const errorMsg = this.getMessage('ERROR_DEFAULT', 'Произошла ошибка при проверке доступа');
            this.showError(errorMsg);
            return false;
        }
    }

    /**
     * Проверка авторизации пользователя через Google Sheets
     */
    async checkAuthorization(chatId) {
        try {
            this.log('info', 'Отправка запроса на проверку авторизации', chatId);
            
            const timeoutConfig = this.config.TIMEOUTS || { API_REQUEST: 10000 };
            const timeout = timeoutConfig.API_REQUEST;
            
            // Создаем промис с таймаутом
            const fetchPromise = fetch(`${this.googleSheetsUrl}?action=checkUser&chatId=${chatId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            );
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);

            if (!response.ok) {
                throw new Error('Ошибка связи с сервером');
            }

            const data = await response.json();
            this.log('info', 'Ответ от сервера получен', data);

            if (data.success && data.user) {
                this.userData = data.user;
                this.log('info', 'Пользователь найден', this.userData);
                return data.user.status === 'active';
            }

            this.log('warn', 'Пользователь не найден или неактивен');
            return false;

        } catch (error) {
            this.log('error', 'Ошибка проверки авторизации', error);
            throw error;
        }
    }

    /**
     * Показать loader при загрузке
     */
    showLoader() {
        const loader = document.getElementById('auth-loader');
        if (loader) {
            loader.classList.remove('hidden');
        }
    }

    /**
     * Скрыть loader
     */
    hideLoader() {
        const loader = document.getElementById('auth-loader');
        if (loader) {
            loader.classList.add('hidden');
        }
    }

    /**
     * Показать приложение
     */
    showApp() {
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.classList.remove('hidden');
        }
    }

    /**
     * Показать сообщение об отказе в доступе
     */
    showAccessDenied() {
        this.hideLoader();
        
        const deniedScreen = document.getElementById('access-denied');
        if (deniedScreen) {
            deniedScreen.classList.remove('hidden');
        }

        // Устанавливаем информацию о пользователе
        const displayConfig = this.config.DISPLAY || {};
        
        if (displayConfig.SHOW_USER_ID_ON_DENY !== false) {
            const chatIdElement = document.getElementById('user-chat-id');
            if (chatIdElement) {
                chatIdElement.textContent = this.userChatId;
            }
        }

        // Закрываем WebApp через заданное время
        const timeoutConfig = this.config.TIMEOUTS || { ACCESS_DENIED_CLOSE: 5000 };
        const closeTimeout = timeoutConfig.ACCESS_DENIED_CLOSE;
        
        this.log('info', `Приложение будет закрыто через ${closeTimeout}ms`);
        
        setTimeout(() => {
            this.log('info', 'Закрытие приложения');
            this.tg.close();
        }, closeTimeout);
    }

    /**
     * Показать ошибку
     */
    showError(message) {
        this.hideLoader();
        
        const errorScreen = document.getElementById('error-screen');
        const errorMessage = document.getElementById('error-message');
        
        if (errorScreen && errorMessage) {
            const displayConfig = this.config.DISPLAY || {};
            
            // Показываем детали ошибки только если включено в конфиге
            if (displayConfig.SHOW_ERROR_DETAILS !== false) {
                errorMessage.textContent = message;
            } else {
                errorMessage.textContent = this.getMessage('ERROR_DEFAULT', 'Произошла ошибка');
            }
            
            errorScreen.classList.remove('hidden');
        }

        // Закрываем WebApp через заданное время
        const timeoutConfig = this.config.TIMEOUTS || { ERROR_CLOSE: 5000 };
        const closeTimeout = timeoutConfig.ERROR_CLOSE;
        
        this.log('error', `Показана ошибка: ${message}. Закрытие через ${closeTimeout}ms`);
        
        setTimeout(() => {
            this.log('info', 'Закрытие приложения после ошибки');
            this.tg.close();
        }, closeTimeout);
    }

    /**
     * Получить данные текущего пользователя
     */
    getUserData() {
        return this.userData;
    }

    /**
     * Проверить, авторизован ли пользователь
     */
    isUserAuthorized() {
        return this.isAuthorized;
    }
}

// Инициализация при загрузке страницы
let authSystem = null;

document.addEventListener('DOMContentLoaded', async () => {
    authSystem = new TelegramAuth();
    const isAuthorized = await authSystem.init();

    // Если пользователь авторизован, можно загрузить основное приложение
    if (isAuthorized) {
        console.log('Пользователь авторизован, загружаем приложение...');
        // Здесь можно инициализировать основное приложение
        if (typeof initApp === 'function') {
            initApp();
        }
    }
});

// Экспорт для использования в других модулях
window.TelegramAuth = TelegramAuth;
window.authSystem = authSystem;
