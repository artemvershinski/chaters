document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterBtn = document.getElementById('showRegister');
    const showLoginBtn = document.getElementById('showLogin');
    const loginBtn = document.getElementById('loginButton');
    const registerBtn = document.getElementById('registerButton');
    const nicknameInput = document.getElementById('regNickname');
    const counter = document.querySelector('.counter');

    checkAuth();

    if (showRegisterBtn) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
            clearInputs();
        });
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.remove('active');
            loginForm.classList.add('active');
            clearInputs();
        });
    }

    if (nicknameInput && counter) {
        nicknameInput.addEventListener('input', () => {
            const length = nicknameInput.value.length;
            counter.textContent = `${length}/20`;
            counter.style.color = length > 18 ? '#ff8888' : '#666';
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
        
        document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        
        document.getElementById('loginEmail')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', handleRegister);
        
        document.getElementById('regConfirmPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleRegister();
        });
    }
});

async function checkAuth() {
    try {
        const user = await API.checkAuth();
        if (user) {
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        console.log('Not authenticated');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const button = document.getElementById('loginButton');

    if (!email || !password) {
        API.showToast('Введите почту и пароль', 'error');
        return;
    }

    button.disabled = true;
    button.innerHTML = '<span>⏳</span>';

    try {
        await API.auth.login({ email, password });
        API.showToast('Успешный вход!', 'success');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 500);
    } catch (error) {
        button.disabled = false;
        button.innerHTML = '<span>войти</span>';
    }
}

async function handleRegister() {
    const email = document.getElementById('regEmail').value.trim();
    const nickname = document.getElementById('regNickname').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const button = document.getElementById('registerButton');

    if (!email || !nickname || !password || !confirmPassword) {
        API.showToast('Все поля обязательны', 'error');
        return;
    }

    if (nickname.length > 20) {
        API.showToast('Ник не длиннее 20 символов', 'error');
        return;
    }

    if (password.length < 6) {
        API.showToast('Пароль минимум 6 символов', 'error');
        return;
    }

    if (password !== confirmPassword) {
        API.showToast('Пароли не совпадают', 'error');
        return;
    }

    button.disabled = true;
    button.innerHTML = '<span>⏳</span>';

    try {
        await API.auth.register({ email, password, nickname });
        API.showToast('Регистрация успешна!', 'success');
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 500);
    } catch (error) {
        button.disabled = false;
        button.innerHTML = '<span>зарегистрироваться</span>';
    }
}

function clearInputs() {
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        if (input.type !== 'password') {
            input.value = '';
        }
    });
    
    const errorToasts = document.querySelectorAll('.toast.error, .toast.success');
    errorToasts.forEach(toast => {
        toast.classList.add('hidden');
    });
    
    const counter = document.querySelector('.counter');
    if (counter) {
        counter.textContent = '0/20';
        counter.style.color = '#666';
    }
}