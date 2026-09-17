/**
 * Correo Temporal de Identidad Persistente
 * Desarrollado con Vanilla JS ES6+ y la API pública de 1secmail.
 */

const API_BASE = 'https://www.1secmail.com/api/v1/';
const POLL_INTERVAL = 10000; // 10 segundos

// Referencias del DOM
const emailAddressEl = document.getElementById('emailAddress');
const copyBtn = document.getElementById('copyBtn');
const newEmailBtn = document.getElementById('newEmailBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusIndicator = document.getElementById('statusIndicator');
const lastUpdatedEl = document.getElementById('lastUpdated');
const emptyState = document.getElementById('emptyState');
const messageList = document.getElementById('messageList');

// Elementos del Modal
const emailModal = document.getElementById('emailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const closeModalFooterBtn = document.getElementById('closeModalFooterBtn');
const modalSubject = document.getElementById('modalSubject');
const modalSender = document.getElementById('modalSender');
const modalDate = document.getElementById('modalDate');
const modalBodyFrame = document.getElementById('modalBodyFrame');
const modalBodyText = document.getElementById('modalBodyText');
const toggleHtmlBtn = document.getElementById('toggleHtmlBtn');
const toggleTextBtn = document.getElementById('toggleTextBtn');
const toast = document.getElementById('toast');

// Estado local de la aplicación
let currentEmail = null;
let currentMailboxLogin = null;
let currentMailboxDomain = null;
let pollTimer = null;

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

/**
 * Inicializa la aplicación recuperando o generando la identidad persistente
 */
async function initApp() {
    // Usamos sessionStorage para mantener la dirección fija mientras la pestaña esté abierta
    const savedEmail = sessionStorage.getItem('temp_mail_address');
    
    if (savedEmail) {
        setEmail(savedEmail);
        fetchInbox();
    } else {
        await generateNewEmail();
    }

    startPolling();
}

/**
 * Configura los escuchadores de eventos
 */
function setupEventListeners() {
    copyBtn.addEventListener('click', copyEmailToClipboard);
    newEmailBtn.addEventListener('click', () => generateNewEmail(true));
    refreshBtn.addEventListener('click', () => {
        if (currentMailboxLogin && currentMailboxDomain) {
            fetchInbox(true);
        }
    });

    // Control de modales
    closeModalBtn.addEventListener('click', closeModal);
    closeModalFooterBtn.addEventListener('click', closeModal);
    emailModal.addEventListener('click', (e) => {
        if (e.target === emailModal) closeModal();
    });

    // Cambios de vista (HTML / Texto plano)
    toggleHtmlBtn.addEventListener('click', () => {
        toggleHtmlBtn.classList.add('active');
        toggleTextBtn.classList.remove('active');
        modalBodyFrame.style.display = 'block';
        modalBodyText.style.display = 'none';
    });

    toggleTextBtn.addEventListener('click', () => {
        toggleTextBtn.classList.add('active');
        toggleHtmlBtn.classList.remove('active');
        modalBodyText.style.display = 'block';
        modalBodyFrame.style.display = 'none';
    });
}

/**
 * Genera una nueva dirección aleatoria en la API de 1secmail
 */
async function generateNewEmail(userRequested = false) {
    if (userRequested) {
        emailAddressEl.textContent = 'Generando nueva dirección...';
    }

    try {
        updateStatus(true, 'Conectando con el servidor...');
        const response = await fetch(`${API_BASE}?action=genRandomMailbox&count=1`);
        
        if (!response.ok) {
            throw new Error(`Error de red: ${response.status}`);
        }

        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            const newEmail = data[0];
            setEmail(newEmail);
            sessionStorage.setItem('temp_mail_address', newEmail);
            
            clearInbox();
            fetchInbox();
            
            updateStatus(false, 'Conectado - Verificando cada 10s');
            if (userRequested) {
                showToast('¡Nueva dirección generada!');
            }
        } else {
            throw new Error('Formato de respuesta inválido');
        }
    } catch (error) {
        console.error('Error al generar correo:', error);
        updateStatus(true, 'Sin conexión / Error de API', true);
        emailAddressEl.textContent = 'Error al generar identidad';
        showToast('Error al conectar con la API', true);
    }
}

/**
 * Configura los parámetros globales del correo actual
 */
function setEmail(email) {
    currentEmail = email;
    emailAddressEl.textContent = email;
    const parts = email.split('@');
    currentMailboxLogin = parts[0];
    currentMailboxDomain = parts[1];
}

/**
 * Obtiene los mensajes del buzón activo
 */
async function fetchInbox(manual = false) {
    if (!currentMailboxLogin || !currentMailboxDomain) return;

    if (manual) {
        refreshBtn.style.transform = 'rotate(360deg)';
        setTimeout(() => refreshBtn.style.transform = 'none', 500);
    }

    try {
        const response = await fetch(`${API_BASE}?action=getMessages&login=${currentMailboxLogin}&domain=${currentMailboxDomain}`);
        
        if (!response.ok) {
            throw new Error(`Error de red: ${response.status}`);
        }

        const messages = await response.json();
        renderMessages(messages);
        updateLastCheckedTime();
        updateStatus(false, 'Conectado - Verificando cada 10s');
    } catch (error) {
        console.error('Error al obtener mensajes:', error);
        updateStatus(true, 'Error al sincronizar buzón', false);
    }
}

/**
 * Dibuja los mensajes en la bandeja de entrada
 */
function renderMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        emptyState.style.display = 'flex';
        messageList.style.display = 'none';
        messageList.innerHTML = '';
        return;
    }

    emptyState.style.display = 'none';
    messageList.style.display = 'flex';

    messageList.innerHTML = messages.map(msg => `
        <div class="message-item" onclick="openMessage(${msg.id})">
            <div class="message-info">
                <span class="message-sender">${escapeHtml(msg.from)}</span>
                <span class="message-subject">${escapeHtml(msg.subject || '(Sin asunto)')}</span>
            </div>
            <span class="message-date">${escapeHtml(msg.date)}</span>
        </div>
    `).join('');
}

/**
 * Lee el contenido detallado de un mensaje específico
 */
window.openMessage = async function(id) {
    if (!currentMailboxLogin || !currentMailboxDomain) return;

    try {
        showToast('Cargando contenido...');
        const response = await fetch(`${API_BASE}?action=readMessage&id=${id}&login=${currentMailboxLogin}&domain=${currentMailboxDomain}`);
        
        if (!response.ok) {
            throw new Error(`Error de red: ${response.status}`);
        }

        const msgData = await response.json();

        modalSubject.textContent = msgData.subject || '(Sin asunto)';
        modalSender.textContent = msgData.from;
        modalDate.textContent = msgData.date;

        const htmlContent = msgData.htmlBody || msgData.body || '<p>(Sin contenido HTML)</p>';
        const textContent = msgData.textBody || msgData.body || '(Sin contenido de texto)';

        // Inyectar HTML de forma segura en el iframe
        const doc = modalBodyFrame.contentDocument || modalBodyFrame.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();

        modalBodyText.textContent = textContent;

        toggleHtmlBtn.click();
        emailModal.style.display = 'flex';
    } catch (error) {
        console.error('Error al leer el mensaje:', error);
        showToast('No se pudo cargar el mensaje', true);
    }
}

/**
 * Cierra el modal de lectura
 */
function closeModal() {
    emailModal.style.display = 'none';
    const doc = modalBodyFrame.contentDocument || modalBodyFrame.contentWindow.document;
    doc.open();
    doc.write('');
    doc.close();
}

/**
 * Copia el correo al portapapeles
 */
function copyEmailToClipboard() {
    if (!currentEmail) return;

    navigator.clipboard.writeText(currentEmail).then(() => {
        showToast('¡Dirección copiada al portapapeles!');
    }).catch(err => {
        console.error('Error al copiar:', err);
        showToast('Error al copiar la dirección', true);
    });
}

/**
 * Configura el sondeo automático cada 10 segundos
 */
function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        if (currentMailboxLogin && currentMailboxDomain) {
            fetchInbox();
        }
    }, POLL_INTERVAL);
}

/**
 * Actualiza el indicador visual de red
 */
function updateStatus(isError, text, isPermanent = false) {
    const dot = statusIndicator.querySelector('.dot');
    statusIndicator.lastChild.textContent = ` ${text}`;
    if (isError) {
        dot.classList.add('error');
        if (isPermanent) clearInterval(pollTimer);
    } else {
        dot.classList.remove('error');
    }
}

/**
 * Actualiza la marca de tiempo de sincronización
 */
function updateLastCheckedTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    lastUpdatedEl.textContent = `Actualizado a las ${timeString}`;
}

/**
 * Limpia la interfaz de la bandeja
 */
function clearInbox() {
    emptyState.style.display = 'flex';
    messageList.style.display = 'none';
    messageList.innerHTML = '';
}

/**
 * Muestra notificaciones estilo Toast
 */
function showToast(message, isError = false) {
    toast.textContent = message;
    toast.style.backgroundColor = isError ? 'var(--danger)' : 'var(--success)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Sanitizador básico anti-XSS para cadenas de texto planas
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}