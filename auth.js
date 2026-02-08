class TelegramAuth {
   constructor(config = null) {
        // === ТЕСТОВЫЙ КОД УДАЛЕН ИЛИ ЗАКОММЕНТИРОВАН ===
         this.TEST_USER_ID = 945603100; 
        // ===============================================

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
    
   
    getMessage(key, defaultValue = '') {
        if (this.messages && this.messages[key]) {
            return this.messages[key];
        }
        return defaultValue;
    }
    
  
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


 getUserChatId() {
    console.log('🔍 === НАЧАЛО ПОЛУЧЕНИЯ USER_ID ===');
    console.log('📱 initData (raw):', this.tg.initData);
    console.log('📱 initData length:', this.tg.initData?.length || 0);
    console.log('👤 initDataUnsafe:', JSON.stringify(this.tg.initDataUnsafe, null, 2));
    console.log('🌐 window.location.href:', window.location.href);
    console.log('🌐 window.location.hash:', window.location.hash);

    // СПОСОБ 1: Стандартный
    if (this.tg.initDataUnsafe?.user?.id) {
        console.log('✅ СПОСОБ 1: ID получен через initDataUnsafe:', this.tg.initDataUnsafe.user.id);
        return this.tg.initDataUnsafe.user.id;
    } else {
        console.log('❌ СПОСОБ 1: initDataUnsafe.user.id недоступен');
    }

    // СПОСОБ 2: Парсинг initData
    try {
        if (this.tg.initData && this.tg.initData.length > 0) {
            console.log('🔄 СПОСОБ 2: Пробую парсить initData...');
            const urlParams = new URLSearchParams(this.tg.initData);
            console.log('📋 Параметры из initData:', Array.from(urlParams.entries()));
            
            const userData = urlParams.get('user');
            if (userData) {
                const user = JSON.parse(userData);
                console.log('✅ СПОСОБ 2: ID получен через парсинг initData:', user.id);
                return user.id;
            } else {
                console.log('❌ СПОСОБ 2: параметр user отсутствует в initData');
            }
        } else {
            console.log('❌ СПОСОБ 2: initData пустая или отсутствует');
        }
    } catch (e) {
        console.error('❌ СПОСОБ 2: Ошибка парсинга:', e);
    }

    // СПОСОБ 3: Telegram.WebView (для старых клиентов)
    try {
        console.log('🔄 СПОСОБ 3: Проверяю TelegramWebviewProxy...');
        console.log('📱 TelegramWebviewProxy exists:', !!window.TelegramWebviewProxy);
        
        if (window.TelegramWebviewProxy?.postEvent) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            console.log('📋 Hash параметры:', Array.from(params.entries()));
            
            const tgWebAppData = params.get('tgWebAppData');
            if (tgWebAppData) {
                const decoded = decodeURIComponent(tgWebAppData);
                const parsed = new URLSearchParams(decoded);
                const userStr = parsed.get('user');
                if (userStr) {
                    const user = JSON.parse(userStr);
                    console.log('✅ СПОСОБ 3: ID получен через TelegramWebviewProxy:', user.id);
                    return user.id;
                }
            } else {
                console.log('❌ СПОСОБ 3: tgWebAppData отсутствует в hash');
            }
        } else {
            console.log('❌ СПОСОБ 3: TelegramWebviewProxy недоступен');
        }
    } catch (e) {
        console.error('❌ СПОСОБ 3: Ошибка TelegramWebviewProxy:', e);
    }

    // СПОСОБ 4: Для разработки (ТОЛЬКО ЕСЛИ ВСЁ ОСТАЛЬНОЕ НЕ СРАБОТАЛО)
    console.log('⚠️ СПОСОБ 4: Все методы не сработали');
    console.log('🔧 TEST_USER_ID exists:', !!this.TEST_USER_ID);
    
    if (this.TEST_USER_ID) {
        console.warn('⚠️ Использую тестовый ID (НЕ РЕАЛЬНЫЙ ПОЛЬЗОВАТЕЛЬ!):', this.TEST_USER_ID);
        return this.TEST_USER_ID;
    }

    console.error('❌ === НЕ УДАЛОСЬ ПОЛУЧИТЬ USER_ID ===');
    return null;
}

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

    
    async checkAuthorization(chatId) {
        try {
            this.log('info', 'Отправка запроса на проверку авторизации', chatId);
            
            const timeoutConfig = this.config.TIMEOUTS || { API_REQUEST: 10000 };
            const timeout = timeoutConfig.API_REQUEST;
            
            // Создаем промис с таймаутом
           const fetchPromise = fetch(`${this.googleSheetsUrl}?action=checkUser&chatId=${chatId}`, {
                method: 'GET'
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

     showLoader() {
        const loader = document.getElementById('auth-loader');
        if (loader) {
            loader.classList.remove('hidden');
        }
    }

 
    hideLoader() {
        const loader = document.getElementById('auth-loader');
        if (loader) {
            loader.classList.add('hidden');
        }
    }

   
    showApp() {
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.classList.remove('hidden');
        }
    }

   
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
        const timeoutConfig = this.config.TIMEOUTS || { ACCESS_DENIED_CLOSE: 500000 };
        const closeTimeout = timeoutConfig.ACCESS_DENIED_CLOSE;
        
        this.log('info', `Приложение будет закрыто через ${closeTimeout}ms`);
        
        setTimeout(() => {
            this.log('info', 'Закрытие приложения');
            this.tg.close();
        }, closeTimeout);
    }

  
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
        const timeoutConfig = this.config.TIMEOUTS || { ERROR_CLOSE: 500000 };
        const closeTimeout = timeoutConfig.ERROR_CLOSE;
        
        this.log('error', `Показана ошибка: ${message}. Закрытие через ${closeTimeout}ms`);
        
        setTimeout(() => {
            this.log('info', 'Закрытие приложения после ошибки');
            this.tg.close();
        }, closeTimeout);
    }

   
    getUserData() {
        return this.userData;
    }

    
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
