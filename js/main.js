import { loadInventory, saveInventory, normalizeInventory } from './store/localStorage.js';
import { CITIES, PRINTER_TYPE_LABELS, PRINTER_MODELS } from './data/defaultData.js';
import {
  formatDate,
  expiryStatus,
  isExpiryAttention,
  daysUntil,
  daysUntilLabel,
  formatEmpty,
  clearSentinel,
  EXPIRY_WARN_DAYS,
  EXPIRY_CRITICAL_DAYS,
} from './helpers/format.js';
import { escapeHtml } from './helpers/group.js';
import { getAdRegistry, getAdRegistrySummary } from './store/adRegistry.js';
import { getEmployeesByCity, getComputersByCity } from './helpers/adMapping.js';

const SECTION_TO_ADD_TYPE = {
  workplaces: 'workplace',
  cash: 'cash',
  printers: 'printer',
};

const ADD_FORM_CONFIG = {
  workplace: {
    title: 'Добавить рабочее место',
    success: 'Рабочее место добавлено.',
    section: 'workplaces',
    deleteLabel: 'рабочее место',
  },
  cash: {
    title: 'Добавить кассу',
    success: 'Касса добавлена.',
    section: 'cash',
    deleteLabel: 'кассу',
  },
  printer: {
    title: 'Добавить принтер',
    success: 'Принтер добавлен.',
    section: 'printers',
    deleteLabel: 'принтер',
  },
};

const THEME_STORAGE_KEY = 'itInventoryPracticeTheme';

const elements = {
  main: document.querySelector('#main-content'),
  navButtons: document.querySelectorAll('.nav__btn'),
  search: document.querySelector('#search'),
  cityFilter: document.querySelector('#city-filter'),
  organizationFilter: document.querySelector('#organization-filter'),
  addWorkplaceButton: document.querySelector('#add-workplace-button'),
  addCashButton: document.querySelector('#add-cash-button'),
  addPrinterButton: document.querySelector('#add-printer-button'),
  adRegistryMeta: document.querySelector('#ad-registry-meta'),
  themeToggle: document.querySelector('#theme-toggle'),
  backupDownload: document.querySelector('#backup-download'),
  backupImport: document.querySelector('#backup-import'),
  backupUpload: document.querySelector('#backup-upload'),
  detailModal: document.querySelector('#detail-modal'),
  modalBody: document.querySelector('#modal-body'),
  modalTitle: document.querySelector('#modal-title'),
  modalFooter: document.querySelector('#modal-footer'),
  modalClose: document.querySelector('#modal-close'),
  formModal: document.querySelector('#form-modal'),
  formTitle: document.querySelector('#form-title'),
  formClose: document.querySelector('#form-close'),
  formError: document.querySelector('#form-error'),
  formSuccess: document.querySelector('#form-success'),
  addForms: {
    workplace: document.querySelector('#add-workplace-form'),
    cash: document.querySelector('#add-cash-form'),
    printer: document.querySelector('#add-printer-form'),
  },
  toast: document.querySelector('#toast'),
  bootError: document.querySelector('#boot-error'),
  moveDialog: document.querySelector('#move-location-dialog'),
  moveDialogClose: document.querySelector('#move-location-close'),
  moveDialogCancel: document.querySelector('#move-location-cancel'),
  moveDialogSubmit: document.querySelector('#move-location-submit'),
  moveDialogMeta: document.querySelector('#move-location-meta'),
  moveCitySelect: document.querySelector('#move-location-city'),
  moveLocationSelect: document.querySelector('#move-location-location'),
  workplaceBulkMoveToggle: document.querySelector('#workplace-bulk-move-toggle'),
  workplaceBulkMoveCancel: document.querySelector('#workplace-bulk-move-cancel'),
  workplaceBulkMoveSubmit: document.querySelector('#workplace-bulk-move-submit'),
};

let inventory = {
  workplaces: [],
  cash: [],
  printers: [],
};
let adRegistry = getAdRegistry();
let activeSection = 'overview';
let searchValue = '';
let cityValue = '';
let organizationValue = '';
let modalState = { section: null, id: null, editing: false, focusField: '' };
let moveDialogState = { section: null, ids: [] };
let workplaceBulkMove = { active: false, selectedIds: new Set() };
let workplaceTabs = { city: 'Москва', location: 'Офис' };
let printerTabs = { city: 'Москва', location: 'Офис' };

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 3200);
}

function persistInventory({ silent = false } = {}) {
  return saveInventory(inventory).catch((error) => {
    console.error(error);

    if (!silent) {
      showToast('Сохранено только в браузере. Запустите: node scripts/serve.mjs');
    }
  });
}

function downloadBackup() {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(inventory, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `it-inventory-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Бэкап скачан');
}

function getCollection(section) {
  return inventory[section === 'workplaces' ? 'workplaces' : section];
}

function findItem(section, id) {
  return getCollection(section).find((entry) => entry.id === id);
}

function openDialog(dialog) {
  if (!dialog) {
    return;
  }

  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal();
      return;
    } catch {
      // Fallback below for browsers without showModal support.
    }
  }

  dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (!dialog) {
    return;
  }

  if (typeof dialog.close === 'function') {
    dialog.close();
    return;
  }

  dialog.removeAttribute('open');
}

function getCities() {
  const cities = new Set();

  [...inventory.workplaces, ...inventory.cash, ...inventory.printers].forEach((item) => {
    if (item.city) {
      cities.add(item.city);
    }
  });

  return [...cities].sort((a, b) => a.localeCompare(b, 'ru'));
}

function fillCityFilter() {
  const current = elements.cityFilter.value;
  elements.cityFilter.innerHTML = '<option value="">Все города</option>';

  getCities().forEach((city) => {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    elements.cityFilter.append(option);
  });

  elements.cityFilter.value = current;
}

function getOrganizations() {
  const organizations = new Set();

  inventory.cash.forEach((item) => {
    if (cityValue && item.city !== cityValue) {
      return;
    }

    const organization = clearSentinel(item.organization);

    if (organization) {
      organizations.add(organization);
    }
  });

  return [...organizations].sort((a, b) => a.localeCompare(b, 'ru'));
}

function fillOrganizationFilter() {
  if (!elements.organizationFilter) {
    return;
  }

  const current = organizationValue;
  elements.organizationFilter.innerHTML = '<option value="">Все организации</option>';

  getOrganizations().forEach((organization) => {
    const option = document.createElement('option');
    option.value = organization;
    option.textContent = organization;
    elements.organizationFilter.append(option);
  });

  const options = [...elements.organizationFilter.options].map((option) => option.value);

  if (options.includes(current)) {
    elements.organizationFilter.value = current;
  } else {
    organizationValue = '';
    elements.organizationFilter.value = '';
  }
}

function matchesOrganization(item, filterValue) {
  return clearSentinel(item.organization) === filterValue;
}

function fillFormCitySelect(form, selectedCity = '') {
  const select = form.elements.city;
  const current = selectedCity || select.value;

  select.innerHTML = '<option value="">Выберите город</option>';

  getWorkplaceCities().forEach((city) => {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    select.append(option);
  });

  select.value = getWorkplaceCities().includes(current) ? current : '';
}

function fillFormLocationSelect(form, city, selectedLocation = '') {
  const select = form.elements.location;
  const locations = getWorkplaceLocations(city);

  if (!city || !locations.length) {
    select.innerHTML = '<option value="">Сначала выберите город</option>';
    select.value = '';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML =
    locations.length > 1
      ? '<option value="">Выберите локацию</option>'
      : '';

  locations.forEach((location) => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    select.append(option);
  });

  if (selectedLocation && locations.includes(selectedLocation)) {
    select.value = selectedLocation;
  } else if (locations.length === 1) {
    select.value = locations[0];
  } else {
    select.value = '';
  }
}

function matchesFilter(item, { skipCityFilter = false } = {}) {
  const haystack = [
    item.city,
    item.location,
    item.model,
    item.computerName,
    item.employee,
    isWorkplaceActive(item) ? 'активно' : 'неактивно',
    item.comment,
    item.ip,
    getPrinterConnection(item) === 'usb' ? 'USB' : '',
    item.serial,
    item.terminalNumber,
    item.brand,
    item.address,
    item.phone,
    item.organization,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const searchOk = !searchValue || haystack.includes(searchValue.toLowerCase());
  const cityOk = skipCityFilter || !cityValue || item.city === cityValue;
  const organizationOk =
    activeSection !== 'cash' || !organizationValue || matchesOrganization(item, organizationValue);

  return searchOk && cityOk && organizationOk;
}

function getWorkplaceCities() {
  return Object.keys(CITIES).sort((a, b) => a.localeCompare(b, 'ru'));
}

function getWorkplaceLocations(city) {
  return CITIES[city] || [];
}

function syncWorkplaceTabs() {
  const cities = getWorkplaceCities();

  if (!cities.includes(workplaceTabs.city)) {
    workplaceTabs.city = cities[0];
  }

  const locations = getWorkplaceLocations(workplaceTabs.city);

  if (!locations.includes(workplaceTabs.location)) {
    workplaceTabs.location = locations[0];
  }
}

function getPrinterCities() {
  return getWorkplaceCities();
}

function getPrinterLocations(city) {
  return CITIES[city] || [];
}

function syncPrinterTabs() {
  const cities = getPrinterCities();

  if (!cities.includes(printerTabs.city)) {
    printerTabs.city = cities[0];
  }

  const locations = getPrinterLocations(printerTabs.city);

  if (!locations.includes(printerTabs.location)) {
    printerTabs.location = locations[0];
  }
}

function renderSubNav(buttons, activeValue, attrName) {
  return `
    <nav class="sub-nav" aria-label="Переключение ${attrName === 'city' ? 'города' : 'локации'}">
      ${buttons
        .map(
          (label) => `
        <button
          class="sub-nav__btn${label === activeValue ? ' sub-nav__btn--active' : ''}"
          type="button"
          data-${attrName}="${escapeHtml(label)}"
        >${escapeHtml(label)}</button>`
        )
        .join('')}
    </nav>
  `;
}

function toggleToolbarForSection() {
  const cityField = elements.cityFilter?.closest('.field');
  const orgField = elements.organizationFilter?.closest('.field');
  const hideCityFilter = activeSection === 'workplaces' || activeSection === 'printers';
  const hideOrgFilter = activeSection !== 'cash';

  if (cityField) {
    cityField.hidden = hideCityFilter;
    cityField.setAttribute('aria-hidden', hideCityFilter ? 'true' : 'false');
  }

  if (orgField) {
    orgField.hidden = hideOrgFilter;
    orgField.setAttribute('aria-hidden', hideOrgFilter ? 'true' : 'false');
  }

  if (elements.addWorkplaceButton) {
    elements.addWorkplaceButton.hidden = activeSection !== 'workplaces';
  }

  if (elements.addCashButton) {
    elements.addCashButton.hidden = activeSection !== 'cash';
  }

  if (elements.addPrinterButton) {
    elements.addPrinterButton.hidden = activeSection !== 'printers';
  }

  updateWorkplaceBulkMoveToolbar();
}

function pluralPrinters(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} принтер`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} принтера`;
  }

  return `${count} принтеров`;
}

function pluralMovedItems(section, count) {
  return section === 'printers' ? pluralPrinters(count) : pluralWorkplaces(count);
}

function getSectionTabs(section) {
  return section === 'printers' ? printerTabs : workplaceTabs;
}

function pluralWorkplaces(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} рабочее место`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} рабочих места`;
  }

  return `${count} рабочих мест`;
}

function resetWorkplaceBulkMove() {
  workplaceBulkMove.active = false;
  workplaceBulkMove.selectedIds.clear();
  updateWorkplaceBulkMoveToolbar();
}

function setWorkplaceBulkMoveActive(active) {
  workplaceBulkMove.active = active;

  if (!active) {
    workplaceBulkMove.selectedIds.clear();
  }

  updateWorkplaceBulkMoveToolbar();

  if (activeSection === 'workplaces') {
    renderWorkplaces();
  }
}

function toggleWorkplaceSelection(workplaceId, selected = null) {
  if (!workplaceId) {
    return;
  }

  const shouldSelect = selected ?? !workplaceBulkMove.selectedIds.has(workplaceId);

  if (shouldSelect) {
    workplaceBulkMove.selectedIds.add(workplaceId);
  } else {
    workplaceBulkMove.selectedIds.delete(workplaceId);
  }

  updateWorkplaceBulkMoveToolbar();
}

function updateWorkplaceBulkMoveToolbar() {
  const { active, selectedIds } = workplaceBulkMove;
  const count = selectedIds.size;
  const onWorkplaces = activeSection === 'workplaces';

  if (elements.workplaceBulkMoveToggle) {
    elements.workplaceBulkMoveToggle.hidden = !onWorkplaces || active;
  }

  if (elements.workplaceBulkMoveCancel) {
    elements.workplaceBulkMoveCancel.hidden = !onWorkplaces || !active;
  }

  if (elements.workplaceBulkMoveSubmit) {
    elements.workplaceBulkMoveSubmit.hidden = !onWorkplaces || !active;
    elements.workplaceBulkMoveSubmit.disabled = count === 0;
    elements.workplaceBulkMoveSubmit.textContent = count ? `Перенести (${count})` : 'Перенести';
  }

  document.body.classList.toggle('workplace-bulk-move', onWorkplaces && active);
}

function workplacePcLabel(item) {
  if (item.computerName?.trim()) {
    return escapeHtml(item.computerName);
  }

  return escapeHtml(item.model);
}

function selectField(label, name, optionsHtml, { id = '', hint = '' } = {}) {
  return `
    <label class="field field--select">
      <span class="field__label">${label}</span>
      <select class="field__control" name="${name}"${id ? ` id="${id}"` : ''}>
        ${optionsHtml}
      </select>
    </label>
    ${hint ? fieldHint(hint) : ''}
  `;
}

function fieldHint(text) {
  return `<p class="form__note">${text}</p>`;
}

function renderComboboxField({
  label,
  name,
  value = '',
  options = [],
  placeholder = '',
  hint = '',
  fieldId = '',
  required = false,
}) {
  const trimmedValue = (value || '').trim();
  const optionValues = [...new Set(options.map((entry) => entry.trim()).filter(Boolean))];

  if (trimmedValue && !optionValues.includes(trimmedValue)) {
    optionValues.unshift(trimmedValue);
  }

  const optionHtml = optionValues.map(
    (option) => `<li class="combobox__option" role="option" data-value="${escapeHtml(option)}">${escapeHtml(option)}</li>`
  );

  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <div class="combobox" data-combobox>
        <input
          class="field__control combobox__input"
          name="${escapeHtml(name)}"
          ${fieldId ? `id="${escapeHtml(fieldId)}"` : ''}
          type="text"
          value="${escapeHtml(trimmedValue)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
          spellcheck="false"${required ? ' required' : ''}
        >
        <ul class="combobox__list" role="listbox" hidden>
          ${optionHtml.join('')}
        </ul>
      </div>
    </label>
    ${hint ? fieldHint(hint) : ''}
  `;
}

function printerModelField(value = '', fieldId = 'printer-model') {
  return renderComboboxField({
    label: 'Модель принтера',
    name: 'model',
    value,
    options: PRINTER_MODELS,
    placeholder: 'Выберите или впишите модель',
    hint: 'Ходовые модели из парка — при необходимости допишите локацию или имя с print-сервера.',
    fieldId,
    required: true,
  });
}

function refreshPrinterAddFields(model = '', connection = 'network', ip = '') {
  const modelContainer = document.querySelector('#printer-add-model-field');
  const connectionContainer = document.querySelector('#printer-add-connection-fields');

  if (!modelContainer || !connectionContainer) {
    return;
  }

  modelContainer.innerHTML = printerModelField(model, 'add-printer-model');
  connectionContainer.innerHTML = printerConnectionFields({ connection, ip }, { ipFieldId: 'add-printer-ip' });
  bindComboboxes(modelContainer);
  bindPrinterConnectionFields(connectionContainer);
}

function getPrinterConnection(item) {
  return String(item?.connection || '').trim().toLowerCase() === 'usb' ? 'usb' : 'network';
}

function formatPrinterConnection(item) {
  if (getPrinterConnection(item) === 'usb') {
    return 'USB';
  }

  const ip = String(item?.ip || '').trim();
  return ip || 'Сеть без IP';
}

const COPY_ICON_HTML =
  '<svg class="copy-ip-btn__icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function printerCopyIpButton(ip) {
  return `<button type="button" class="button button--ghost button--compact copy-ip-btn" data-copy-ip="${escapeHtml(ip)}" aria-label="Скопировать IP ${escapeHtml(ip)}" title="Скопировать IP">${COPY_ICON_HTML}</button>`;
}

function renderPrinterConnectionCell(row) {
  if (getPrinterConnection(row) === 'usb') {
    return badgeHtml('neutral', 'USB');
  }

  const ip = String(row?.ip || '').trim();
  if (!ip) {
    return badgeHtml('warning', 'Сеть без IP');
  }

  return `<span class="printer-connection"><span class="printer-connection__ip">${escapeHtml(ip)}</span>${printerCopyIpButton(ip)}</span>`;
}

function bindCopyIpButtons(container) {
  container.querySelectorAll('[data-copy-ip]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const ip = button.dataset.copyIp || '';

      try {
        await navigator.clipboard.writeText(ip);
        showToast(`IP скопирован: ${ip}`);
      } catch (error) {
        console.error(error);
        showToast('Не удалось скопировать IP');
      }
    });
  });
}

function isPrinterMissingNetworkAddress(item) {
  return getPrinterConnection(item) === 'network' && !String(item?.ip || '').trim();
}

function printerConnectionFields(item = {}, { ipFieldId = '' } = {}) {
  const connection = getPrinterConnection(item);
  const ipFieldIdAttr = ipFieldId ? ` id="${escapeHtml(ipFieldId)}"` : '';

  return `
    <label class="field field--select">
      <span class="field__label">Подключение</span>
      <select class="field__control" name="connection" data-printer-connection>
        <option value="network" ${connection === 'network' ? 'selected' : ''}>Сеть (IP)</option>
        <option value="usb" ${connection === 'usb' ? 'selected' : ''}>USB</option>
      </select>
    </label>
    <label class="field" data-printer-ip-field${connection === 'usb' ? ' hidden' : ''}>
      <span class="field__label">IP-адрес</span>
      <input
        class="field__control"
        name="ip"
        ${ipFieldIdAttr}
        type="text"
        value="${escapeHtml(item.ip || '')}"
        placeholder="192.168.1.50"
        ${connection === 'usb' ? ' disabled' : ''}
      >
    </label>
  `;
}

function bindPrinterConnectionFields(container = document) {
  container.querySelectorAll('[data-printer-connection]').forEach((select) => {
    if (select.dataset.bound === 'true') {
      return;
    }

    select.dataset.bound = 'true';

    const form = select.closest('form');
    const ipField = form?.querySelector('[data-printer-ip-field]');
    const ipInput = form?.querySelector('[name="ip"]');

    select.addEventListener('change', () => {
      const isUsb = select.value === 'usb';

      if (ipField) {
        ipField.hidden = isUsb;
      }

      if (ipInput) {
        ipInput.disabled = isUsb;

        if (isUsb) {
          ipInput.value = '';
        }
      }
    });
  });
}

function readPrinterFormData(formData) {
  const connection = formData.get('connection') === 'usb' ? 'usb' : 'network';
  const ip = String(formData.get('ip')).trim();

  if (connection === 'network' && ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return { error: 'IP-адрес указан в неверном формате.' };
  }

  return {
    connection,
    ip: connection === 'usb' ? '' : ip,
  };
}

function isWorkplaceActive(item) {
  return item?.active !== false;
}

function workplaceStatusBadge(item) {
  return isWorkplaceActive(item) ? badgeHtml('ok', 'Активно') : badgeHtml('neutral', 'Неактивно');
}

function workplaceStatusField(item) {
  const active = isWorkplaceActive(item);

  return `
    <label class="field field--select">
      <span class="field__label">Статус</span>
      <select class="field__control" name="active">
        <option value="true" ${active ? 'selected' : ''}>Активно</option>
        <option value="false" ${!active ? 'selected' : ''}>Неактивно</option>
      </select>
    </label>
  `;
}

function workplaceEmployeeField(city, value, fieldId = 'ad-employees') {
  const employees = adRegistry ? getEmployeesByCity(city, adRegistry) : [];
  const current = (value || 'Не назначен').trim() || 'Не назначен';
  const inputValue = current === 'Не назначен' ? '' : current;

  if (!adRegistry) {
    return `
      <label class="field">
        <span class="field__label">Сотрудник</span>
        <input class="field__control" name="employee" type="text" value="${escapeHtml(inputValue)}" placeholder="ФИО">
      </label>
      ${fieldHint('Справочник AD не загружен — укажите ФИО вручную.')}
    `;
  }

  if (!city) {
    return `
      <label class="field">
        <span class="field__label">Сотрудник</span>
        <input class="field__control" name="employee" type="text" value="${escapeHtml(inputValue)}" placeholder="ФИО">
      </label>
      ${fieldHint('Укажите город — подскажем сотрудников из OU или впишите ФИО вручную.')}
    `;
  }

  const hint = employees.length
    ? `Впишите ФИО или выберите из ${employees.length} сотр. OU «${escapeHtml(city)} / Пользователи».`
    : `В справочнике нет сотрудников для «${escapeHtml(city)}» — впишите ФИО вручную.`;

  const options = [
    '<li class="combobox__option" role="option" data-value="Не назначен">Не назначен</li>',
    ...employees.map(
      (employee) =>
        `<li class="combobox__option" role="option" data-value="${escapeHtml(employee.displayName)}">${escapeHtml(employee.displayName)}</li>`
    ),
  ];

  if (inputValue && !employees.some((employee) => employee.displayName === inputValue)) {
    options.push(
      `<li class="combobox__option" role="option" data-value="${escapeHtml(inputValue)}">${escapeHtml(inputValue)}</li>`
    );
  }

  return `
    <label class="field">
      <span class="field__label">Сотрудник</span>
      <div class="combobox" data-combobox>
        <input
          class="field__control combobox__input"
          name="employee"
          id="${fieldId}"
          type="text"
          value="${escapeHtml(inputValue)}"
          placeholder="ФИО или выберите из списка"
          autocomplete="off"
          spellcheck="false"
        >
        <ul class="combobox__list" role="listbox" hidden>
          ${options.join('')}
        </ul>
      </div>
    </label>
    ${fieldHint(hint)}
  `;
}

function bindComboboxes(container = document) {
  container.querySelectorAll('[data-combobox]').forEach((combobox) => {
    if (combobox.dataset.bound === 'true') {
      return;
    }

    combobox.dataset.bound = 'true';

    const input = combobox.querySelector('.combobox__input');
    const list = combobox.querySelector('.combobox__list');
    const options = [...list.querySelectorAll('.combobox__option')];

    if (!input || !list || !options.length) {
      return;
    }

    let activeIndex = -1;

    const visibleOptions = () => options.filter((option) => !option.hidden);

    const hideList = () => {
      list.hidden = true;
      activeIndex = -1;
      options.forEach((option) => option.classList.remove('combobox__option--active'));
    };

    const setActiveOption = (index) => {
      const visible = visibleOptions();

      if (!visible.length) {
        activeIndex = -1;
        return;
      }

      activeIndex = Math.max(0, Math.min(index, visible.length - 1));
      options.forEach((option) => option.classList.remove('combobox__option--active'));
      visible[activeIndex].classList.add('combobox__option--active');
      visible[activeIndex].scrollIntoView({ block: 'nearest' });
    };

    const showAllOptions = () => {
      options.forEach((option) => {
        option.hidden = false;
      });
      list.hidden = false;

      const currentValue = input.value.trim();
      const currentIndex = options.findIndex((option) => option.dataset.value.trim() === currentValue);
      setActiveOption(currentIndex >= 0 ? currentIndex : 0);
    };

    const filterOptions = () => {
      const query = input.value.trim().toLowerCase();
      let visibleCount = 0;

      options.forEach((option) => {
        const text = option.dataset.value.trim().toLowerCase();
        const match = !query || text.includes(query);
        option.hidden = !match;

        if (match) {
          visibleCount += 1;
        }
      });

      list.hidden = visibleCount === 0;
      setActiveOption(0);
    };

    const selectOption = (option) => {
      input.value = option.dataset.value || option.textContent.trim();
      hideList();
    };

    input.addEventListener('focus', showAllOptions);
    input.addEventListener('click', showAllOptions);
    input.addEventListener('input', filterOptions);

    input.addEventListener('keydown', (event) => {
      const visible = visibleOptions();

      if (event.key === 'ArrowDown') {
        event.preventDefault();

        if (list.hidden) {
          showAllOptions();
          return;
        }

        setActiveOption(activeIndex + 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();

        if (list.hidden) {
          showAllOptions();
          return;
        }

        setActiveOption(activeIndex <= 0 ? visible.length - 1 : activeIndex - 1);
        return;
      }

      if (event.key === 'Enter' && !list.hidden && activeIndex >= 0 && visible[activeIndex]) {
        event.preventDefault();
        selectOption(visible[activeIndex]);
        return;
      }

      if (event.key === 'Escape') {
        hideList();
      }
    });

    options.forEach((option) => {
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        selectOption(option);
      });
    });

    input.addEventListener('blur', () => {
      window.setTimeout(hideList, 120);
    });
  });
}

function workplaceComputerField(city, value, fieldId = 'ad-computers') {
  const computers = adRegistry ? getComputersByCity(city, adRegistry) : [];
  const current = (value || '').trim();
  const names = computers.map((computer) => computer.name);
  const currentInList = names.includes(current);

  if (!adRegistry) {
    return `
      <label class="field">
        <span class="field__label">Имя ПК в домене</span>
        <input class="field__control" name="computerName" type="text" value="${escapeHtml(current)}" placeholder="NSK-WSS-001">
      </label>
      ${fieldHint('Справочник AD не загружен.')}
    `;
  }

  if (!city) {
    return `
      <label class="field">
        <span class="field__label">Имя ПК в домене</span>
        <input class="field__control" name="computerName" type="text" value="${escapeHtml(current)}" placeholder="NSK-WSS-001">
      </label>
      ${fieldHint('Укажите город — покажем ПК из OU этого города.')}
    `;
  }

  if (!computers.length) {
    return `
      <label class="field">
        <span class="field__label">Имя ПК в домене</span>
        <input class="field__control" name="computerName" type="text" value="${escapeHtml(current)}" placeholder="NSK-WSS-001">
      </label>
      ${fieldHint(`В справочнике нет компьютеров для «${escapeHtml(city)}».`)}
    `;
  }

  const options = [
    `<option value=""${!current ? ' selected' : ''}>Не указан</option>`,
    ...computers.map(
      (computer) =>
        `<option value="${escapeHtml(computer.name)}"${
          computer.name === current ? ' selected' : ''
        }>${escapeHtml(computer.name)}</option>`
    ),
  ];

  if (current && !currentInList) {
    options.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (текущий)</option>`);
  }

  return selectField('Имя ПК в домене', 'computerName', options.join(''), {
    id: fieldId,
    hint: `${computers.length} ПК из OU «${escapeHtml(city)}»`,
  });
}

function refreshWorkplaceAddFields(city = '', employee = '', computerName = '') {
  const container = document.querySelector('#workplace-add-fields');

  if (!container) {
    return;
  }

  container.innerHTML =
    workplaceEmployeeField(city, employee, 'add-ad-employees') +
    workplaceComputerField(city, computerName, 'add-ad-computers');
  bindComboboxes(container);
}

function badgeHtml(status, text) {
  return `<span class="badge badge--${status}">${text}</span>`;
}

function expiryDaysBadgeText(isoDate) {
  const days = daysUntil(isoDate);

  if (days === null) {
    return '—';
  }

  if (days < 0) {
    return `−${Math.abs(days)} дн.`;
  }

  if (days === 0) {
    return 'сегодня';
  }

  if (days === 1) {
    return 'завтра';
  }

  return `${days} дн.`;
}

function expiryBadgeHtml(isoDate, { emptyLabel = 'Не указана' } = {}) {
  const value = String(isoDate || '').trim();

  if (!value) {
    return badgeHtml('warning', emptyLabel);
  }

  const status = expiryStatus(value);
  return badgeHtml(status, `${formatDate(value)} · ${daysUntilLabel(value)}`);
}

function expirySplitHtml(isoDate, { emptyLabel = 'Не указана' } = {}) {
  const value = String(isoDate || '').trim();

  if (!value) {
    return badgeHtml('warning', emptyLabel);
  }

  const status = expiryStatus(value);

  return `<span class="expiry-split"><span class="expiry-split__date">${escapeHtml(formatDate(value))}</span>${badgeHtml(status, expiryDaysBadgeText(value))}</span>`;
}

function sortByExpiryDate(items, field) {
  return [...items].sort((left, right) => {
    const leftDays = daysUntil(left[field]);
    const rightDays = daysUntil(right[field]);

    if (leftDays === null && rightDays === null) {
      return 0;
    }

    if (leftDays === null) {
      return 1;
    }

    if (rightDays === null) {
      return -1;
    }

    return leftDays - rightDays;
  });
}

function getCashFieldAlerts(field, items = inventory.cash) {
  return sortByExpiryDate(
    items.filter((item) => {
      const status = expiryStatus(item[field]);
      return isExpiryAttention(status) || !String(item[field] || '').trim();
    }),
    field
  );
}

function getUpcomingCashItems(field, limit = OVERVIEW_UPCOMING_LIMIT, excludeIds = new Set(), items = inventory.cash) {
  return sortByExpiryDate(
    items.filter((item) => {
      if (excludeIds.has(item.id)) {
        return false;
      }

      const days = daysUntil(item[field]);
      return days !== null && days > EXPIRY_WARN_DAYS;
    }),
    field
  ).slice(0, limit);
}

function getPrinterStats(items = inventory.printers) {
  const byType = {};

  items.forEach((item) => {
    const type = item.printerType || 'other';
    byType[type] = (byType[type] || 0) + 1;
  });

  return {
    total: items.length,
    byType,
    withoutIp: items.filter((item) => isPrinterMissingNetworkAddress(item)),
  };
}

function getOverviewFilterLabel() {
  const parts = [];

  if (cityValue) {
    parts.push(cityValue);
  }

  if (searchValue) {
    parts.push(`«${searchValue}»`);
  }

  return parts.join(' · ');
}

function cashExpiryBadge(item, field) {
  return expirySplitHtml(item[field], { emptyLabel: 'Дата не указана' });
}

function renderOverviewExpiryContent(field, alerts, upcoming, { calmMessage, urgentLabel, upcomingLabel }) {
  const parts = [];

  if (alerts.length) {
    parts.push(`
      <p class="overview-subtitle overview-subtitle--urgent">${escapeHtml(urgentLabel)}</p>
      <ul class="overview-list">${alerts.map((item) => renderOverviewCashRow(item, field)).join('')}</ul>
    `);
  }

  if (upcoming.length) {
    if (!alerts.length) {
      parts.push(`<p class="overview-calm">${calmMessage}</p>`);
    }

    parts.push(`
      <p class="overview-subtitle">${escapeHtml(upcomingLabel)}</p>
      <ul class="overview-list overview-list--muted">
        ${upcoming.map((item) => renderOverviewCashRow(item, field)).join('')}
      </ul>
    `);
  }

  if (!parts.length) {
    return `<p class="panel__empty">${calmMessage}</p>`;
  }

  return parts.join('');
}

const OVERVIEW_UPCOMING_LIMIT = 5;

function moveHintButton() {
  return '<span class="hint-move-btn" aria-hidden="true">→</span>';
}

function rowInteractionHint({ move = false, bulk = false } = {}) {
  const parts = ['Строка — карточка'];

  if (move) {
    parts.push(`${moveHintButton()} — перенос в другую локацию`);
  }

  if (bulk) {
    parts.push('«Выбрать для переноса» — несколько сразу');
  }

  return `${parts.join('. ')}.`;
}

function renderOverviewCashRow(item, field) {
  return `
    <li class="overview-row" data-section="cash" data-id="${escapeHtml(item.id)}" tabindex="0" role="button">
      <div class="overview-row__main">
        <strong class="overview-row__title">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</strong>
        <span class="overview-row__meta">${escapeHtml(item.model)}</span>
      </div>
      ${cashExpiryBadge(item, field)}
    </li>
  `;
}

function renderOverviewSection(title, hint, content) {
  return `
    <section class="panel overview-panel">
      <h2 class="panel__title">${title}</h2>
      ${hint ? `<p class="panel__hint panel__hint--top">${hint}</p>` : ''}
      ${content}
    </section>
  `;
}

function bindOverviewRows(container) {
  container.querySelectorAll('.overview-row[data-id]').forEach((row) => {
    row.addEventListener('click', () => openDetail(row.dataset.section, row.dataset.id));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(row.dataset.section, row.dataset.id);
      }
    });
  });
}

function terminalCell(value) {
  if (value?.trim()) {
    return escapeHtml(value);
  }

  return badgeHtml('warning', 'Не указан');
}

function bindRowEvents(container, section) {
  container.querySelectorAll('tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('[data-move-workplace], [data-move-printer], [data-copy-ip]')) {
        return;
      }

      openDetail(section, row.dataset.id);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.target.closest('[data-move-workplace], [data-move-printer], [data-copy-ip]')) {
          return;
        }

        event.preventDefault();
        openDetail(section, row.dataset.id);
      }
    });
  });
}

function fillMoveLocationSelect(city, currentLocation = '') {
  const select = elements.moveLocationSelect;
  const locations = getWorkplaceLocations(city);

  select.innerHTML = locations.length > 1 ? '<option value="">Выберите локацию</option>' : '';

  locations.forEach((location) => {
    const option = document.createElement('option');
    option.value = location;
    option.textContent = location;
    select.append(option);
  });

  const alternative = locations.find((location) => location !== currentLocation);
  select.value = alternative || locations[0] || '';
}

function fillMoveCitySelect(city) {
  const select = elements.moveCitySelect;
  select.innerHTML = '';

  getWorkplaceCities().forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry;
    option.textContent = entry;
    select.append(option);
  });

  select.value = getWorkplaceCities().includes(city) ? city : getWorkplaceCities()[0] || '';
}

function openMoveDialog(section, ids) {
  const normalizedIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  const items = normalizedIds.map((id) => findItem(section, id)).filter(Boolean);

  if (!items.length || !elements.moveDialog) {
    return;
  }

  moveDialogState = { section, ids: items.map((item) => item.id) };
  const tabs = getSectionTabs(section);

  if (items.length === 1) {
    const item = items[0];
    elements.moveDialogMeta.textContent = `${item.city} · ${item.location} →`;
    fillMoveCitySelect(item.city);
    fillMoveLocationSelect(elements.moveCitySelect.value, item.location);
  } else {
    const placements = [...new Set(items.map((item) => `${item.city} · ${item.location}`))];

    elements.moveDialogMeta.textContent =
      placements.length === 1
        ? `${pluralMovedItems(section, items.length)} из ${placements[0]} →`
        : `${pluralMovedItems(section, items.length)} из ${placements.length} локаций →`;
    fillMoveCitySelect(tabs.city || items[0].city);
    fillMoveLocationSelect(elements.moveCitySelect.value, '');
  }

  openDialog(elements.moveDialog);
}

function openMoveWorkplaceDialog(workplaceIds) {
  openMoveDialog('workplaces', workplaceIds);
}

function openMovePrinterDialog(printerIds) {
  openMoveDialog('printers', printerIds);
}

function moveItemsToLocation(section, ids, city, location) {
  const normalizedIds = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  const nextCity = String(city).trim();
  const nextLocation = String(location).trim();

  if (!nextCity || !nextLocation) {
    showToast('Выберите город и локацию');
    return false;
  }

  let moved = 0;
  let skipped = 0;

  normalizedIds.forEach((itemId) => {
    const item = findItem(section, itemId);

    if (!item) {
      return;
    }

    if (item.city === nextCity && item.location === nextLocation) {
      skipped += 1;
      return;
    }

    item.city = nextCity;
    item.location = nextLocation;
    moved += 1;
  });

  if (moved === 0) {
    showToast(skipped ? 'Уже в этой локации' : 'Нечего переносить');
    return false;
  }

  persistInventory();
  showToast(`Перенесено: ${pluralMovedItems(section, moved)} → ${nextCity} · ${nextLocation}`);

  if (activeSection === section) {
    const tabs = getSectionTabs(section);
    tabs.city = nextCity;
    tabs.location = nextLocation;
  }

  const detailId = modalState.section === section ? modalState.id : null;
  const shouldRefreshDetail =
    detailId && moveDialogState.ids.includes(detailId) && elements.detailModal?.hasAttribute('open');

  if (section === 'workplaces') {
    resetWorkplaceBulkMove();
  }

  render();

  if (shouldRefreshDetail) {
    openDetail(section, detailId, modalState.editing);
  }

  return true;
}

function moveWorkplacesToLocation(workplaceIds, city, location) {
  return moveItemsToLocation('workplaces', workplaceIds, city, location);
}

function moveWorkplaceToLocation(workplaceId, city, location) {
  return moveWorkplacesToLocation([workplaceId], city, location);
}

function submitMoveDialog() {
  if (!moveDialogState.ids.length || !moveDialogState.section) {
    return;
  }

  if (
    moveItemsToLocation(
      moveDialogState.section,
      moveDialogState.ids,
      elements.moveCitySelect.value,
      elements.moveLocationSelect.value
    )
  ) {
    clearMoveDialog();
  }
}

function clearMoveDialog() {
  closeDialog(elements.moveDialog);
  moveDialogState = { section: null, ids: [] };
}

function bindMoveWorkplaceDialog() {
  if (!elements.moveDialog) {
    return;
  }

  elements.moveCitySelect?.addEventListener('change', (event) => {
    const item =
      moveDialogState.ids.length === 1 && moveDialogState.section
        ? findItem(moveDialogState.section, moveDialogState.ids[0])
        : null;
    fillMoveLocationSelect(event.target.value, item?.location || '');
  });

  elements.moveDialogClose?.addEventListener('click', clearMoveDialog);
  elements.moveDialogCancel?.addEventListener('click', clearMoveDialog);
  elements.moveDialogSubmit?.addEventListener('click', submitMoveDialog);
}

function bindWorkplaceBulkSelection(container, rows) {
  const refreshSelectionUi = () => {
    container.querySelectorAll('tbody tr[data-id]').forEach((row) => {
      const selected = workplaceBulkMove.selectedIds.has(row.dataset.id);
      row.classList.toggle('table__row--selected', selected);
      const checkbox = row.querySelector('.workplace-select');

      if (checkbox) {
        checkbox.checked = selected;
      }
    });

    const selectAll = container.querySelector('#workplace-select-all');

    if (selectAll) {
      selectAll.checked = rows.length > 0 && rows.every((row) => workplaceBulkMove.selectedIds.has(row.id));
    }
  };

  container.querySelector('#workplace-select-all')?.addEventListener('change', (event) => {
    rows.forEach((row) => {
      toggleWorkplaceSelection(row.id, event.target.checked);
    });
    refreshSelectionUi();
  });

  container.querySelectorAll('.workplace-select').forEach((checkbox) => {
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    checkbox.addEventListener('change', (event) => {
      toggleWorkplaceSelection(event.target.dataset.workplaceId, event.target.checked);
      refreshSelectionUi();
    });
  });

  container.querySelectorAll('tbody tr[data-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('.table__select')) {
        return;
      }

      toggleWorkplaceSelection(row.dataset.id);
      refreshSelectionUi();
    });
  });
}

function bindWorkplaceBulkMoveToolbar() {
  elements.workplaceBulkMoveToggle?.addEventListener('click', () => {
    setWorkplaceBulkMoveActive(true);
  });

  elements.workplaceBulkMoveCancel?.addEventListener('click', () => {
    resetWorkplaceBulkMove();

    if (activeSection === 'workplaces') {
      renderWorkplaces();
    }
  });

  elements.workplaceBulkMoveSubmit?.addEventListener('click', () => {
    if (!workplaceBulkMove.selectedIds.size) {
      return;
    }

    openMoveWorkplaceDialog([...workplaceBulkMove.selectedIds]);
  });
}

function renderTableHtml(section, rows, columns, { bulkSelect = false, selectedIds = new Set() } = {}) {
  const allSelected = bulkSelect && rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const selectHeader = bulkSelect
    ? `<th class="table__select"><input type="checkbox" id="workplace-select-all" aria-label="Выбрать все на странице"${allSelected ? ' checked' : ''}></th>`
    : '';

  return `
    <div class="table-wrap">
      <table class="table${section === 'cash' ? ' table--cash' : ''}${bulkSelect ? ' table--selectable' : ''}">
        <thead>
          <tr>${selectHeader}${columns.map((col) => `<th>${col.label}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => {
              const isSelected = bulkSelect && selectedIds.has(row.id);
              const rowAttrs = bulkSelect
                ? ` class="table__row${isSelected ? ' table__row--selected' : ''}"`
                : ' tabindex="0" role="button" aria-label="Открыть карточку"';

              return `
            <tr data-id="${row.id}" data-section="${section}"${rowAttrs}>
              ${
                bulkSelect
                  ? `<td class="table__select"><input type="checkbox" class="workplace-select" data-workplace-id="${escapeHtml(row.id)}" aria-label="Выбрать"${isSelected ? ' checked' : ''}></td>`
                  : ''
              }
              ${columns.map((col) => `<td>${col.render(row)}</td>`).join('')}
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTable(section, rows, columns) {
  if (rows.length === 0) {
    elements.main.innerHTML = `
      <section class="panel">
        <p class="panel__empty">Ничего не найдено. Попробуйте изменить фильтры.</p>
      </section>
    `;
    return;
  }

  elements.main.innerHTML = `
    <section class="panel">
      ${renderTableHtml(section, rows, columns)}
      <p class="panel__hint">Нажмите на строку, чтобы открыть карточку.</p>
    </section>
  `;

  bindRowEvents(elements.main, section);
}

function renderOverview() {
  const filteredWorkplaces = inventory.workplaces.filter(matchesFilter);
  const filteredCash = inventory.cash.filter(matchesFilter);
  const filteredPrinters = inventory.printers.filter(matchesFilter);
  const filterLabel = getOverviewFilterLabel();

  const fnAlerts = getCashFieldAlerts('fnExpiry', filteredCash);
  const ofdAlerts = getCashFieldAlerts('ofdExpiry', filteredCash);
  const fnAlertIds = new Set(fnAlerts.map((item) => item.id));
  const ofdAlertIds = new Set(ofdAlerts.map((item) => item.id));
  const fnUpcoming = getUpcomingCashItems('fnExpiry', OVERVIEW_UPCOMING_LIMIT, fnAlertIds, filteredCash);
  const ofdUpcoming = getUpcomingCashItems('ofdExpiry', OVERVIEW_UPCOMING_LIMIT, ofdAlertIds, filteredCash);
  const missingTerminal = filteredCash.filter((item) => !item.terminalNumber?.trim());
  const printerStats = getPrinterStats(filteredPrinters);
  const attentionCashIds = new Set([...fnAlerts, ...ofdAlerts].map((item) => item.id));
  const cashAttentionCount = attentionCashIds.size;

  const printerTypeSummary = Object.entries(PRINTER_TYPE_LABELS)
    .map(([type, label]) => {
      const count = printerStats.byType[type] || 0;
      return count ? `<span class="overview-stat">${count} ${label.toLowerCase()}</span>` : '';
    })
    .filter(Boolean)
    .join('');

  elements.main.innerHTML = `
    ${
      filterLabel
        ? `<p class="panel__meta panel__meta--top">Показано по фильтру: ${escapeHtml(filterLabel)}</p>`
        : ''
    }
    <section class="cards">
      <article class="card card--clickable" data-go="workplaces">
        <p class="card__label">Рабочие места</p>
        <p class="card__value">${filteredWorkplaces.length}</p>
        <p class="card__hint">Сотрудник, компьютер, модель и статус</p>
      </article>
      <article class="card card--clickable" data-go="cash">
        <p class="card__label">Кассовое оборудование</p>
        <p class="card__value">${filteredCash.length}</p>
        <p class="card__hint">${
          cashAttentionCount
            ? `${cashAttentionCount} ${cashAttentionCount === 1 ? 'касса требует' : 'кассы требуют'} внимания`
            : 'ФН и ОФД в порядке'
        }</p>
      </article>
      <article class="card card--clickable" data-go="printers">
        <p class="card__label">Принтеры</p>
        <p class="card__value">${printerStats.total}</p>
        <p class="card__hint">${printerTypeSummary || 'Справочник оборудования'}</p>
      </article>
    </section>

    ${
      filteredCash.length
        ? renderOverviewSection(
            'Фискальный накопитель (ФН)',
            '',
            renderOverviewExpiryContent('fnExpiry', fnAlerts, fnUpcoming, {
              calmMessage: 'Срочных нет',
              urgentLabel: 'Срочная замена',
              upcomingLabel: 'Ближайшая замена',
            })
          )
        : ''
    }

    ${
      filteredCash.length
        ? renderOverviewSection(
            'ОФД',
            '',
            renderOverviewExpiryContent('ofdExpiry', ofdAlerts, ofdUpcoming, {
              calmMessage: 'Срочных нет',
              urgentLabel: 'Срочное продление',
              upcomingLabel: 'Ближайшее продление',
            })
          )
        : ''
    }

    ${renderOverviewSection(
      'Принтеры',
      'Модель, тип и подключение — сеть, USB или без IP.',
      `
        <div class="overview-stats">
          <span class="overview-stat overview-stat--total">${printerStats.total} всего</span>
          ${printerTypeSummary}
          ${
            printerStats.withoutIp.length
              ? `<span class="overview-stat overview-stat--warn">${printerStats.withoutIp.length} сеть без IP</span>`
              : '<span class="overview-stat overview-stat--ok">Подключение указано у всех</span>'
          }
        </div>
        ${
          printerStats.withoutIp.length
            ? `<ul class="overview-list overview-list--compact">
                ${printerStats.withoutIp
                  .slice(0, 6)
                  .map(
                    (item) => `
                  <li class="overview-row" data-section="printers" data-id="${escapeHtml(item.id)}" tabindex="0" role="button">
                    <div class="overview-row__main">
                      <strong class="overview-row__title">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</strong>
                      <span class="overview-row__meta">${escapeHtml(item.model)} · ${escapeHtml(PRINTER_TYPE_LABELS[item.printerType] || item.printerType)}</span>
                    </div>
                    ${badgeHtml('neutral', 'Сеть без IP')}
                  </li>`
                  )
                  .join('')}
                ${
                  printerStats.withoutIp.length > 6
                    ? `<li class="overview-more">…и ещё ${printerStats.withoutIp.length - 6}</li>`
                    : ''
                }
              </ul>`
            : ''
        }
      `
    )}

    ${
      missingTerminal.length
        ? renderOverviewSection(
            'Терминалы Сбербанка',
            'Кассы без номера терминала. Строка — карточка.',
            `<ul class="overview-list overview-list--compact">
              ${missingTerminal
                .map(
                  (item) => `
                <li class="overview-row" data-section="cash" data-id="${escapeHtml(item.id)}" tabindex="0" role="button">
                  <div class="overview-row__main">
                    <strong class="overview-row__title">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</strong>
                    <span class="overview-row__meta">${escapeHtml(item.model)}</span>
                  </div>
                  ${badgeHtml('warning', 'Номер не указан')}
                </li>`
                )
                .join('')}
            </ul>`
          )
        : ''
    }
  `;

  elements.main.querySelectorAll('[data-go]').forEach((card) => {
    card.addEventListener('click', () => switchSection(card.dataset.go));
  });

  bindOverviewRows(elements.main);
}

function workplaceMoveButton(row) {
  return `<button type="button" class="button button--ghost button--compact table-action" data-move-workplace="${escapeHtml(row.id)}" aria-label="Перенести в другую локацию" title="Перенести">→</button>`;
}

function printerMoveButton(row) {
  return `<button type="button" class="button button--ghost button--compact table-action" data-move-printer="${escapeHtml(row.id)}" aria-label="Перенести в другую локацию" title="Перенести">→</button>`;
}

function renderWorkplaces() {
  syncWorkplaceTabs();

  const cities = getWorkplaceCities();
  const locations = getWorkplaceLocations(workplaceTabs.city);
  const rows = inventory.workplaces.filter((item) => {
    if (!matchesFilter(item, { skipCityFilter: true })) {
      return false;
    }

    return item.city === workplaceTabs.city && item.location === workplaceTabs.location;
  });

  const bulkActive = workplaceBulkMove.active;
  const columns = [
    { label: 'Сотрудник', render: (row) => escapeHtml(row.employee || '—') },
    { label: 'Имя ПК', render: (row) => workplacePcLabel(row) },
    { label: 'Модель', render: (row) => escapeHtml(row.model) },
    {
      label: 'Статус',
      render: (row) => workplaceStatusBadge(row),
    },
  ];

  if (!bulkActive) {
    columns.push({ label: '', render: (row) => workplaceMoveButton(row) });
  }

  const tableBlock =
    rows.length === 0
      ? '<p class="panel__empty">В этой локации пока нет рабочих мест. Нажмите «+ Рабочее место».</p>'
      : `
        <div class="workplace-table-wrap">
          ${renderTableHtml('workplaces', rows, columns, {
            bulkSelect: bulkActive,
            selectedIds: workplaceBulkMove.selectedIds,
          })}
        </div>
        ${bulkActive ? '' : renderWorkplaceCardsHtml(rows)}
        <p class="panel__hint">${
          bulkActive
            ? 'Отметьте строки галочками или кликом, затем «Перенести» вверху.'
            : rowInteractionHint({ move: true, bulk: true })
        }</p>`;

  elements.main.innerHTML = `
    ${renderSubNav(cities, workplaceTabs.city, 'city')}
    ${renderSubNav(locations, workplaceTabs.location, 'location')}
    <section class="panel">
      <p class="panel__meta">${escapeHtml(workplaceTabs.city)} · ${escapeHtml(workplaceTabs.location)} · ${rows.length} шт.</p>
      ${tableBlock}
    </section>
  `;

  elements.main.querySelectorAll('[data-city]').forEach((button) => {
    button.addEventListener('click', () => {
      workplaceTabs.city = button.dataset.city;
      workplaceTabs.location = getWorkplaceLocations(workplaceTabs.city)[0];
      renderWorkplaces();
    });
  });

  elements.main.querySelectorAll('[data-location]').forEach((button) => {
    button.addEventListener('click', () => {
      workplaceTabs.location = button.dataset.location;
      renderWorkplaces();
    });
  });

  updateWorkplaceBulkMoveToolbar();

  if (bulkActive && rows.length) {
    bindWorkplaceBulkSelection(elements.main, rows);
  } else {
    bindRowEvents(elements.main, 'workplaces');
    bindWorkplaceCardEvents(elements.main);
  }

  elements.main.querySelectorAll('[data-move-workplace]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMoveWorkplaceDialog(button.dataset.moveWorkplace);
    });
  });
}

function bindWorkplaceCardEvents(container) {
  container.querySelectorAll('.workplace-card[data-id]').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-move-workplace]')) {
        return;
      }

      openDetail('workplaces', card.dataset.id);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.target.closest('[data-move-workplace]')) {
          return;
        }

        event.preventDefault();
        openDetail('workplaces', card.dataset.id);
      }
    });
  });
}

function renderWorkplaceCard(row) {
  return `
    <article class="workplace-card" data-id="${escapeHtml(row.id)}" data-section="workplaces" tabindex="0" role="button" aria-label="Открыть карточку рабочего места">
      <div class="workplace-card__body">
        <p class="workplace-card__title">${escapeHtml(row.employee || '—')}</p>
        <p class="workplace-card__meta">${workplacePcLabel(row)} · ${escapeHtml(row.model)}</p>
        <div class="workplace-card__status">${workplaceStatusBadge(row)}</div>
      </div>
      <div class="workplace-card__actions">${workplaceMoveButton(row)}</div>
    </article>
  `;
}

function renderWorkplaceCardsHtml(rows) {
  return `<div class="workplace-cards">${rows.map(renderWorkplaceCard).join('')}</div>`;
}

function bindCashCardEvents(container) {
  container.querySelectorAll('.cash-card[data-id]').forEach((card) => {
    card.addEventListener('click', () => openDetail('cash', card.dataset.id));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail('cash', card.dataset.id);
      }
    });
  });
}

function renderCashCard(row) {
  return `
    <article class="cash-card" data-id="${escapeHtml(row.id)}" data-section="cash" tabindex="0" role="button" aria-label="Открыть карточку кассы">
      <div class="cash-card__head">
        <p class="cash-card__place">${escapeHtml(row.city)} · ${escapeHtml(row.location)}</p>
        <p class="cash-card__model">${escapeHtml(row.model)}</p>
      </div>
      <dl class="cash-card__fields">
        <div class="cash-card__field">
          <dt>Организация</dt>
          <dd>${escapeHtml(formatEmpty(row.organization))}</dd>
        </div>
        <div class="cash-card__field">
          <dt>№ терминала</dt>
          <dd>${terminalCell(row.terminalNumber)}</dd>
        </div>
      </dl>
      <div class="cash-card__expiry">
        <div class="cash-card__expiry-item">
          <span class="cash-card__expiry-label">ФН</span>
          ${expirySplitHtml(row.fnExpiry)}
        </div>
        <div class="cash-card__expiry-item">
          <span class="cash-card__expiry-label">ОФД</span>
          ${expirySplitHtml(row.ofdExpiry)}
        </div>
      </div>
    </article>
  `;
}

function renderCashCardsHtml(rows) {
  return `<div class="cash-cards">${rows.map(renderCashCard).join('')}</div>`;
}

function renderCash() {
  const rows = inventory.cash.filter(matchesFilter);
  const columns = [
    { label: 'Город', render: (row) => escapeHtml(row.city) },
    { label: 'Локация', render: (row) => escapeHtml(row.location) },
    { label: 'Касса', render: (row) => escapeHtml(row.model) },
    { label: 'Организация', render: (row) => escapeHtml(formatEmpty(row.organization)) },
    { label: '№ терминала', render: (row) => terminalCell(row.terminalNumber) },
    {
      label: 'Окончание ФН',
      render: (row) => expirySplitHtml(row.fnExpiry),
    },
    {
      label: 'Окончание ОФД',
      render: (row) => expirySplitHtml(row.ofdExpiry),
    },
  ];

  if (rows.length === 0) {
    elements.main.innerHTML = `
      <section class="panel">
        <p class="panel__empty">Ничего не найдено. Попробуйте изменить фильтры.</p>
      </section>
    `;
    return;
  }

  elements.main.innerHTML = `
    <section class="panel">
      <div class="cash-table-wrap">
        ${renderTableHtml('cash', rows, columns)}
      </div>
      ${renderCashCardsHtml(rows)}
      <p class="panel__hint panel__hint--cash">Нажмите на карточку или строку, чтобы открыть детали.</p>
    </section>
  `;

  bindRowEvents(elements.main, 'cash');
  bindCashCardEvents(elements.main);
}

function bindPrinterCardEvents(container) {
  container.querySelectorAll('.printer-card[data-id]').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-move-printer], [data-copy-ip]')) {
        return;
      }

      openDetail('printers', card.dataset.id);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.target.closest('[data-move-printer], [data-copy-ip]')) {
          return;
        }

        event.preventDefault();
        openDetail('printers', card.dataset.id);
      }
    });
  });
}

function renderPrinterCard(row) {
  const typeLabel = PRINTER_TYPE_LABELS[row.printerType] || row.printerType;

  return `
    <article class="printer-card" data-id="${escapeHtml(row.id)}" data-section="printers" tabindex="0" role="button" aria-label="Открыть карточку принтера">
      <div class="printer-card__body">
        <p class="printer-card__title">${escapeHtml(row.model)}</p>
        <p class="printer-card__meta">${escapeHtml(typeLabel)} · ${renderPrinterConnectionCell(row)}</p>
      </div>
      <div class="printer-card__actions">${printerMoveButton(row)}</div>
    </article>
  `;
}

function renderPrinterCardsHtml(rows) {
  return `<div class="printer-cards">${rows.map(renderPrinterCard).join('')}</div>`;
}

function renderPrinters() {
  syncPrinterTabs();

  const cities = getPrinterCities();
  const locations = getPrinterLocations(printerTabs.city);
  const rows = inventory.printers.filter((item) => {
    if (!matchesFilter(item, { skipCityFilter: true })) {
      return false;
    }

    return item.city === printerTabs.city && item.location === printerTabs.location;
  });

  const columns = [
    { label: 'Модель', render: (row) => escapeHtml(row.model) },
    {
      label: 'Тип',
      render: (row) => escapeHtml(PRINTER_TYPE_LABELS[row.printerType] || row.printerType),
    },
    { label: 'Подключение', render: (row) => renderPrinterConnectionCell(row) },
    { label: '', render: (row) => printerMoveButton(row) },
  ];

  const listBlock =
    rows.length === 0
      ? '<p class="panel__empty">В этой локации пока нет принтеров. Нажмите «+ Принтер».</p>'
      : `
        <div class="printer-table-wrap">
          ${renderTableHtml('printers', rows, columns)}
        </div>
        ${renderPrinterCardsHtml(rows)}
        <p class="panel__hint">${rowInteractionHint({ move: true })}</p>
      `;

  elements.main.innerHTML = `
    ${renderSubNav(cities, printerTabs.city, 'city')}
    ${renderSubNav(locations, printerTabs.location, 'location')}
    <section class="panel">
      <p class="panel__meta">${escapeHtml(printerTabs.city)} · ${escapeHtml(printerTabs.location)} · ${rows.length} шт.</p>
      ${listBlock}
    </section>
  `;

  elements.main.querySelectorAll('[data-city]').forEach((button) => {
    button.addEventListener('click', () => {
      printerTabs.city = button.dataset.city;
      printerTabs.location = getPrinterLocations(printerTabs.city)[0];
      renderPrinters();
    });
  });

  elements.main.querySelectorAll('[data-location]').forEach((button) => {
    button.addEventListener('click', () => {
      printerTabs.location = button.dataset.location;
      renderPrinters();
    });
  });

  if (rows.length) {
    bindRowEvents(elements.main, 'printers');
    bindPrinterCardEvents(elements.main);
    bindCopyIpButtons(elements.main);
  }

  elements.main.querySelectorAll('[data-move-printer]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMovePrinterDialog(button.dataset.movePrinter);
    });
  });
}

function detailRow(label, contentHtml, { field = '', attentionValue = '', highlightAttention = true } = {}) {
  const attention = highlightAttention && isDetailAttentionValue(attentionValue);
  const rowClass = field ? 'details__row details__row--clickable' : 'details__row';
  const fieldAttr = field ? ` data-detail-field="${field}" tabindex="0" role="button"` : '';
  const ariaLabel = field ? ` aria-label="Редактировать: ${label}"` : '';

  return `<div class="${rowClass}"${fieldAttr}${ariaLabel}><dt>${escapeHtml(label)}</dt><dd class="details__value${
    attention ? ' details__value--attention' : ''
  }">${contentHtml}</dd></div>`;
}

function isDetailAttentionValue(value) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .trim();

  if (!text || text === '—') {
    return true;
  }

  if (/^не назначен$/i.test(text)) {
    return true;
  }

  return /не указан|уточня|дата не указана|номер не указан/i.test(text);
}

function bindDetailViewInteractions() {
  elements.modalBody.querySelectorAll('[data-detail-field]').forEach((row) => {
    const openFieldEdit = () => {
      openDetail(modalState.section, modalState.id, true, row.dataset.detailField);
    };

    row.addEventListener('click', (event) => {
      if (event.target.closest('[data-copy-ip]')) {
        return;
      }

      openFieldEdit();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openFieldEdit();
      }
    });
  });

  bindCopyIpButtons(elements.modalBody);
}

function focusDetailField(fieldName) {
  if (!fieldName) {
    return;
  }

  const control = elements.modalBody.querySelector(`#detail-edit-form [name="${fieldName}"]`);

  if (!control) {
    return;
  }

  control.focus();
  control.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderDetailView(section, item) {
  const hint = '<p class="details__hint">Клик по полю или «Редактировать». Подсветка — стоит уточнить.</p>';

  if (section === 'workplaces') {
    elements.modalTitle.textContent = 'Рабочее место';

    return `
      <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
      ${hint}
      <dl class="details">
        ${detailRow('Сотрудник', escapeHtml(item.employee), { field: 'employee', attentionValue: item.employee })}
        ${detailRow('Статус', workplaceStatusBadge(item), { field: 'active', highlightAttention: false })}
        ${detailRow('Имя ПК', escapeHtml(item.computerName || '—'), { field: 'computerName', attentionValue: item.computerName })}
        ${detailRow('Модель ПК', escapeHtml(item.model), { field: 'model', attentionValue: item.model })}
        ${detailRow('Процессор', escapeHtml(item.specs.cpu), { field: 'cpu', attentionValue: item.specs.cpu })}
        ${detailRow('ОЗУ', escapeHtml(item.specs.ram), { field: 'ram', attentionValue: item.specs.ram })}
        ${detailRow('Накопитель', escapeHtml(item.specs.ssd), { field: 'ssd', attentionValue: item.specs.ssd })}
        ${detailRow('Монитор', escapeHtml(item.specs.monitor), { field: 'monitor', attentionValue: item.specs.monitor })}
        ${detailRow('Клавиатура', escapeHtml(item.specs.keyboard || '—'), { field: 'keyboard', attentionValue: item.specs.keyboard })}
        ${detailRow('Мышь', escapeHtml(item.specs.mouse || '—'), { field: 'mouse', attentionValue: item.specs.mouse })}
        ${detailRow('Веб-камера', escapeHtml(item.specs.webcam || '—'), { field: 'webcam', attentionValue: item.specs.webcam })}
        ${detailRow('Наушники', escapeHtml(item.specs.headphones || '—'), { field: 'headphones', attentionValue: item.specs.headphones })}
        ${detailRow('ИБП', escapeHtml(item.specs.ups), { field: 'ups', attentionValue: item.specs.ups })}
        ${detailRow('ОС', escapeHtml(item.specs.os), { field: 'os', attentionValue: item.specs.os })}
        ${detailRow('Заметка', formatCommentHtml(item.comment), { field: 'comment', highlightAttention: false })}
      </dl>
    `;
  }

  if (section === 'cash') {
    elements.modalTitle.textContent = 'Кассовое оборудование';

    return `
      <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
      ${hint}
      <dl class="details">
        ${detailRow('Касса', escapeHtml(item.model), { field: 'model', attentionValue: item.model })}
        ${detailRow('Бренд', escapeHtml(formatEmpty(item.brand)), { field: 'brand', attentionValue: item.brand })}
        ${detailRow('Адрес', escapeHtml(formatEmpty(item.address)), { field: 'address', attentionValue: item.address })}
        ${detailRow('Телефон', escapeHtml(formatEmpty(item.phone)), { field: 'phone', attentionValue: item.phone })}
        ${detailRow('Организация', escapeHtml(formatEmpty(item.organization)), { field: 'organization', attentionValue: item.organization })}
        ${detailRow('№ терминала Сбербанка', terminalCell(item.terminalNumber), {
          field: 'terminalNumber',
          attentionValue: item.terminalNumber,
        })}
        ${detailRow('Серийный номер ККТ', escapeHtml(formatEmpty(item.serial)), { field: 'serial', attentionValue: item.serial })}
        ${detailRow('Окончание ФН', expiryBadgeHtml(item.fnExpiry, { emptyLabel: 'Дата не указана' }), {
          field: 'fnExpiry',
          attentionValue: item.fnExpiry,
        })}
        ${detailRow('Окончание ОФД', expiryBadgeHtml(item.ofdExpiry, { emptyLabel: 'Дата не указана' }), {
          field: 'ofdExpiry',
          attentionValue: item.ofdExpiry,
        })}
      </dl>
    `;
  }

  elements.modalTitle.textContent = 'Принтер';

  return `
    <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
    ${hint}
    <dl class="details">
      ${detailRow('Модель', escapeHtml(item.model), { field: 'model', attentionValue: item.model })}
      ${detailRow('Тип', escapeHtml(PRINTER_TYPE_LABELS[item.printerType] || item.printerType), { field: 'printerType', attentionValue: item.printerType })}
      ${detailRow('Подключение', renderPrinterConnectionCell(item), {
        field: getPrinterConnection(item) === 'usb' ? 'connection' : 'ip',
        attentionValue: getPrinterConnection(item) === 'usb' ? item.connection : item.ip,
      })}
    </dl>
  `;
}

function inputField(label, name, value, type = 'text') {
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <input class="field__control" name="${name}" type="${type}" value="${escapeHtml(clearSentinel(value))}">
    </label>
  `;
}

function textareaField(label, name, value, { placeholder = '', rows = 3 } = {}) {
  return `
    <label class="field">
      <span class="field__label">${label}</span>
      <textarea class="field__control field__control--textarea" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(clearSentinel(value))}</textarea>
    </label>
  `;
}

function formatCommentHtml(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '—';
  }

  return escapeHtml(text).replace(/\n/g, '<br>');
}

function renderDetailEdit(section, item) {
  if (section === 'workplaces') {
    elements.modalTitle.textContent = 'Редактирование · рабочее место';

    return `
      <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
      <form class="form" id="detail-edit-form">
        ${workplaceEmployeeField(item.city, item.employee, 'edit-ad-employees')}
        ${workplaceComputerField(item.city, item.computerName || '', 'edit-ad-computers')}
        ${workplaceStatusField(item)}
        ${inputField('Модель / железо', 'model', item.model)}
        ${inputField('Процессор', 'cpu', item.specs.cpu)}
        ${inputField('ОЗУ', 'ram', item.specs.ram)}
        ${inputField('Накопитель', 'ssd', item.specs.ssd)}
        ${inputField('Монитор', 'monitor', item.specs.monitor)}
        ${inputField('Клавиатура', 'keyboard', item.specs.keyboard)}
        ${inputField('Мышь', 'mouse', item.specs.mouse)}
        ${inputField('Веб-камера', 'webcam', item.specs.webcam)}
        ${inputField('Наушники', 'headphones', item.specs.headphones)}
        ${inputField('ИБП', 'ups', item.specs.ups)}
        ${inputField('ОС', 'os', item.specs.os)}
        ${textareaField('Заметка', 'comment', item.comment, { placeholder: 'Комментарий к рабочему месту' })}
      </form>
    `;
  }

  if (section === 'cash') {
    elements.modalTitle.textContent = 'Редактирование · касса';

    return `
      <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
      <form class="form" id="detail-edit-form">
        ${inputField('№ терминала Сбербанка', 'terminalNumber', item.terminalNumber)}
        ${inputField('Серийный номер ККТ', 'serial', item.serial)}
        ${inputField('Телефон', 'phone', item.phone)}
        ${inputField('Адрес', 'address', item.address)}
        ${inputField('Бренд', 'brand', item.brand)}
        ${inputField('Организация', 'organization', item.organization)}
        ${inputField('Окончание ФН', 'fnExpiry', item.fnExpiry, 'date')}
        ${inputField('Окончание ОФД', 'ofdExpiry', item.ofdExpiry, 'date')}
      </form>
    `;
  }

  elements.modalTitle.textContent = 'Редактирование · принтер';

  return `
    <p class="modal__meta">${escapeHtml(item.city)} · ${escapeHtml(item.location)}</p>
    <form class="form" id="detail-edit-form">
      ${printerModelField(item.model, 'detail-printer-model')}
      ${printerConnectionFields(item, { ipFieldId: 'detail-printer-ip' })}
      <label class="field field--select">
        <span class="field__label">Тип</span>
        <select class="field__control" name="printerType">
          ${Object.entries(PRINTER_TYPE_LABELS)
            .map(
              ([value, label]) =>
                `<option value="${value}" ${item.printerType === value ? 'selected' : ''}>${label}</option>`
            )
            .join('')}
        </select>
      </label>
    </form>
  `;
}

function renderDetailFooter() {
  if (modalState.editing) {
    elements.modalFooter.innerHTML = `
      <button class="button button--danger" type="button" id="detail-delete">Удалить</button>
      <div class="modal__footer-actions">
        <button class="button button--ghost" type="button" id="detail-cancel">Отмена</button>
        <button class="button button--primary" type="button" id="detail-save">Сохранить</button>
      </div>
    `;

    elements.modalFooter.querySelector('#detail-cancel').addEventListener('click', () => {
      modalState.editing = false;
      openDetail(modalState.section, modalState.id, false);
    });

    elements.modalFooter.querySelector('#detail-save').addEventListener('click', saveDetailEdit);
    return;
  }

  elements.modalFooter.innerHTML = `
    <button class="button button--danger" type="button" id="detail-delete">Удалить</button>
    <div class="modal__footer-actions">
      <button class="button button--ghost" type="button" id="detail-close-btn">Закрыть</button>
      ${modalState.section === 'workplaces' || modalState.section === 'printers' ? '<button class="button button--ghost" type="button" id="detail-move">Перенести</button>' : ''}
      <button class="button button--primary" type="button" id="detail-edit">Редактировать</button>
    </div>
  `;

  elements.modalFooter.querySelector('#detail-close-btn').addEventListener('click', closeDetailModal);
  elements.modalFooter.querySelector('#detail-move')?.addEventListener('click', () => {
    openMoveDialog(modalState.section, modalState.id);
  });
  elements.modalFooter.querySelector('#detail-edit').addEventListener('click', () => {
    openDetail(modalState.section, modalState.id, true);
  });
}

function getDeleteSummary(section, item) {
  if (section === 'workplaces') {
    return item.employee && item.employee !== 'Не назначен' ? item.employee : item.model;
  }

  return item.model || item.serial || item.id;
}

function deleteItem(section, id) {
  const collection = getCollection(section);
  const index = collection.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return false;
  }

  collection.splice(index, 1);
  persistInventory();
  return true;
}

function deleteCurrentItem() {
  const { section, id } = modalState;

  if (!section || !id) {
    return;
  }

  const item = findItem(section, id);

  if (!item) {
    return;
  }

  const addType = SECTION_TO_ADD_TYPE[section];
  const typeLabel = ADD_FORM_CONFIG[addType]?.deleteLabel || 'запись';
  const summary = getDeleteSummary(section, item);

  if (!window.confirm(`Удалить ${typeLabel} «${summary}»?\n\nЭто действие нельзя отменить.`)) {
    return;
  }

  if (!deleteItem(section, id)) {
    showToast('Не удалось удалить запись');
    return;
  }

  closeDetailModal();
  showToast('Запись удалена');
  render();
}

function saveDetailEdit() {
  const form = elements.modalBody.querySelector('#detail-edit-form');

  if (!form) {
    return;
  }

  const formData = new FormData(form);
  const item = findItem(modalState.section, modalState.id);

  if (!item) {
    return;
  }

  if (modalState.section === 'workplaces') {
    item.computerName = String(formData.get('computerName')).trim();
    item.model = String(formData.get('model')).trim();
    item.employee = String(formData.get('employee')).trim() || 'Не назначен';
    item.active = formData.get('active') === 'true';
    item.comment = String(formData.get('comment') || '').trim();

    item.specs = {
      cpu: String(formData.get('cpu')).trim(),
      ram: String(formData.get('ram')).trim(),
      ssd: String(formData.get('ssd')).trim(),
      monitor: String(formData.get('monitor')).trim(),
      keyboard: String(formData.get('keyboard')).trim(),
      mouse: String(formData.get('mouse')).trim(),
      webcam: String(formData.get('webcam')).trim(),
      headphones: String(formData.get('headphones')).trim(),
      ups: String(formData.get('ups')).trim(),
      os: String(formData.get('os')).trim() || 'Windows 11 Pro',
    };
  }

  if (modalState.section === 'cash') {
    item.terminalNumber = String(formData.get('terminalNumber')).trim();
    item.serial = String(formData.get('serial')).trim();
    item.phone = String(formData.get('phone')).trim();
    item.address = String(formData.get('address')).trim();
    item.brand = String(formData.get('brand')).trim();
    item.organization = String(formData.get('organization')).trim();
    item.fnExpiry = formData.get('fnExpiry');
    item.ofdExpiry = formData.get('ofdExpiry');
  }

  if (modalState.section === 'printers') {
    const printerData = readPrinterFormData(formData);

    if (printerData.error) {
      showToast(printerData.error);
      return;
    }

    item.model = String(formData.get('model')).trim();
    item.connection = printerData.connection;
    item.ip = printerData.ip;
    item.printerType = formData.get('printerType') || 'mfp';
  }

  persistInventory();
  showToast('Изменения сохранены');
  closeDetailModal();
  render();
}

function openDetail(section, id, editing = false, focusField = '') {
  const item = findItem(section, id);

  if (!item) {
    return;
  }

  modalState = { section, id, editing, focusField };
  elements.modalBody.innerHTML = editing ? renderDetailEdit(section, item) : renderDetailView(section, item);
  renderDetailFooter();

  if (editing && (section === 'workplaces' || section === 'printers')) {
    bindComboboxes(elements.modalBody);

    if (section === 'printers') {
      bindPrinterConnectionFields(elements.modalBody);
    }
  }

  if (!editing) {
    bindDetailViewInteractions();
  } else if (focusField) {
    requestAnimationFrame(() => focusDetailField(focusField));
  }

  if (!elements.detailModal.open) {
    openDialog(elements.detailModal);
  }
}

function closeDetailModal() {
  modalState = { section: null, id: null, editing: false, focusField: '' };
  closeDialog(elements.detailModal);
}

function switchSection(section) {
  if (section !== 'workplaces' && workplaceBulkMove.active) {
    resetWorkplaceBulkMove();
  }

  activeSection = section;

  elements.navButtons.forEach((button) => {
    button.classList.toggle('nav__btn--active', button.dataset.section === section);
  });

  render();
}

function render() {
  fillCityFilter();
  fillOrganizationFilter();
  toggleToolbarForSection();

  if (activeSection === 'overview') {
    renderOverview();
    return;
  }

  if (activeSection === 'workplaces') {
    renderWorkplaces();
    return;
  }

  if (activeSection === 'cash') {
    renderCash();
    return;
  }

  renderPrinters();
}

function openFormModal(type) {
  const form = elements.addForms[type];
  const config = ADD_FORM_CONFIG[type];

  if (!form || !config) {
    showToast('Форма добавления недоступна');
    return;
  }

  clearFormMessages();

  Object.values(elements.addForms).forEach((entry) => {
    if (entry) {
      entry.hidden = true;
    }
  });

  elements.formTitle.textContent = config.title;
  form.hidden = false;
  form.reset();

  let presetCity = '';
  let presetLocation = '';

  if (type === 'workplace') {
    presetCity = workplaceTabs.city || '';
    presetLocation = workplaceTabs.location || '';
  } else if (type === 'printer') {
    presetCity = printerTabs.city || '';
    presetLocation = printerTabs.location || '';
  } else if (cityValue) {
    presetCity = cityValue;
  }

  fillFormCitySelect(form, presetCity);
  fillFormLocationSelect(form, presetCity, presetLocation);

  if (type === 'workplace') {
    refreshWorkplaceAddFields(presetCity);
  } else if (type === 'printer') {
    refreshPrinterAddFields();
  }

  openDialog(elements.formModal);
}

function clearFormMessages() {
  elements.formError.hidden = true;
  elements.formSuccess.hidden = true;
  elements.formError.textContent = '';
  elements.formSuccess.textContent = '';
}

function renderAdRegistryMeta() {
  if (!elements.adRegistryMeta) {
    return;
  }

  const summary = getAdRegistrySummary(adRegistry);

  if (!summary) {
    elements.adRegistryMeta.textContent = '';
    return;
  }

  elements.adRegistryMeta.textContent = `Справочник AD: ${summary.employees} сотр., ${summary.computers} ПК`;
  elements.adRegistryMeta.title = `Обновлён: ${summary.syncedAt}`;
}

function bindGlobalActions() {
  document.addEventListener('click', (event) => {
    const addTrigger = event.target.closest('[data-add-type]');

    if (addTrigger) {
      event.preventDefault();
      openFormModal(addTrigger.dataset.addType);
      return;
    }

    const moveWorkplaceTrigger = event.target.closest('[data-move-workplace]');

    if (moveWorkplaceTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openMoveWorkplaceDialog(moveWorkplaceTrigger.dataset.moveWorkplace);
      return;
    }

    const movePrinterTrigger = event.target.closest('[data-move-printer]');

    if (movePrinterTrigger) {
      event.preventDefault();
      event.stopPropagation();
      openMovePrinterDialog(movePrinterTrigger.dataset.movePrinter);
      return;
    }

    if (event.target.closest('#detail-delete')) {
      event.preventDefault();
      deleteCurrentItem();
    }
  });
}

function validateForm(formData, type) {
  const city = String(formData.get('city')).trim();
  const location = String(formData.get('location')).trim();
  const model = String(formData.get('model')).trim();

  if (!city || !location || !model) {
    return 'Заполните обязательные поля: город, локация, модель.';
  }

  if (type === 'printer') {
    const printerData = readPrinterFormData(formData);

    if (printerData.error) {
      return printerData.error;
    }
  }

  return '';
}

function handleFormSubmit(event) {
  event.preventDefault();
  clearFormMessages();

  const form = event.currentTarget;
  const type = form.dataset.type;
  const formData = new FormData(form);
  const error = validateForm(formData, type);

  if (error) {
    elements.formError.textContent = error;
    elements.formError.hidden = false;
    return;
  }

  const id = `${type}-${Date.now()}`;

  if (type === 'workplace') {
    const employee = String(formData.get('employee')).trim() || 'Не назначен';

    inventory.workplaces.unshift({
      id,
      city: formData.get('city').trim(),
      location: formData.get('location').trim(),
      employee,
      active: true,
      computerName: String(formData.get('computerName') || '').trim(),
      model: formData.get('model').trim(),
      comment: String(formData.get('comment') || '').trim(),
      specs: {
        cpu: 'уточняется',
        ram: 'уточняется',
        ssd: 'уточняется',
        monitor: 'уточняется',
        keyboard: 'уточняется',
        mouse: 'уточняется',
        webcam: 'уточняется',
        headphones: 'нет',
        ups: 'уточняется',
        os: 'Windows 11',
      },
    });
  }

  if (type === 'cash') {
    inventory.cash.unshift({
      id,
      city: formData.get('city').trim(),
      location: formData.get('location').trim(),
      model: formData.get('model').trim(),
      terminalNumber: String(formData.get('terminalNumber')).trim(),
      brand: '—',
      address: formData.get('location').trim(),
      phone: '—',
      organization: 'ООО СеверТрейд',
      fnExpiry: formData.get('fnExpiry') || '',
      ofdExpiry: formData.get('ofdExpiry') || '',
      serial: `NEW-${Math.floor(Math.random() * 90000 + 10000)}`,
    });
  }

  if (type === 'printer') {
    const printerData = readPrinterFormData(formData);

    inventory.printers.unshift({
      id,
      city: formData.get('city').trim(),
      location: formData.get('location').trim(),
      model: formData.get('model').trim(),
      connection: printerData.connection,
      ip: printerData.ip,
      printerType: formData.get('printerType') || 'mfp',
    });
  }

  persistInventory();

  elements.formSuccess.textContent = ADD_FORM_CONFIG[type].success;
  elements.formSuccess.hidden = false;
  showToast('Запись сохранена');

  setTimeout(() => {
    closeDialog(elements.formModal);
    switchSection(ADD_FORM_CONFIG[type].section);
  }, 700);
}

function bindAddForms() {
  Object.entries(elements.addForms).forEach(([, form]) => {
    if (!form) {
      return;
    }

    form.addEventListener('submit', handleFormSubmit);

    if (!form.elements.city) {
      return;
    }

    form.elements.city.addEventListener('change', (event) => {
      const city = event.target.value.trim();
      fillFormLocationSelect(form, city);

      if (form.dataset.type === 'workplace') {
        const employee = String(form.elements.employee?.value || '').trim();
        const computerName = String(form.elements.computerName?.value || '').trim();
        refreshWorkplaceAddFields(city, employee, computerName);
      }
    });
  });

  elements.formModal?.querySelectorAll('.form-cancel').forEach((button) => {
    button.addEventListener('click', () => closeDialog(elements.formModal));
  });
}

function showBootError(message) {
  if (!elements.bootError) {
    return;
  }

  elements.bootError.hidden = false;
  elements.bootError.textContent = message;
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light';
  } catch (error) {
    return 'light';
  }
}

function applyTheme(theme) {
  const isDark = theme === 'dark';

  if (isDark) {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch (error) {
    // ignore quota / private mode
  }

  if (!elements.themeToggle) {
    return;
  }

  elements.themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
  elements.themeToggle.textContent = isDark ? '☀' : '☾';
  elements.themeToggle.title = isDark ? 'Светлая тема' : 'Тёмная тема';
  elements.themeToggle.setAttribute('aria-label', isDark ? 'Включить светлую тему' : 'Включить тёмную тему');
}

function initTheme() {
  applyTheme(getStoredTheme());
}

function toggleTheme() {
  applyTheme(getStoredTheme() === 'dark' ? 'light' : 'dark');
}

async function boot() {
  try {
    inventory = await loadInventory();

    elements.navButtons.forEach((button) => {
      button.addEventListener('click', () => switchSection(button.dataset.section));
    });

    elements.search?.addEventListener('input', (event) => {
      searchValue = event.target.value.trim();
      render();
    });

    elements.cityFilter?.addEventListener('change', (event) => {
      cityValue = event.target.value;
      fillOrganizationFilter();
      render();
    });

    elements.organizationFilter?.addEventListener('change', (event) => {
      organizationValue = event.target.value;
      render();
    });

    bindGlobalActions();
    bindAddForms();
    initTheme();
    elements.themeToggle?.addEventListener('click', toggleTheme);
    elements.backupDownload?.addEventListener('click', downloadBackup);
    elements.backupImport?.addEventListener('click', () => elements.backupUpload?.click());
    elements.backupUpload?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      try {
        inventory = normalizeInventory(JSON.parse(await file.text()));
        await persistInventory();
        render();
        showToast('Бэкап загружен');
      } catch (error) {
        console.error(error);
        showToast('Не удалось загрузить бэкап');
      } finally {
        event.target.value = '';
      }
    });
    bindMoveWorkplaceDialog();
    bindWorkplaceBulkMoveToolbar();
    renderAdRegistryMeta();
    elements.modalClose?.addEventListener('click', closeDetailModal);
    elements.formClose?.addEventListener('click', () => closeDialog(elements.formModal));

    render();
  } catch (error) {
    console.error(error);
    showBootError(
      `Не удалось загрузить приложение: ${error.message}. Запустите node scripts/serve.mjs и откройте http://127.0.0.1:8770`
    );
  }
}

boot();
