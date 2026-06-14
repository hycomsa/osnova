import { describe, expect, it } from 'vitest'
import {
  ALL_VIEWS, allowedViews, canAccessView, canEdit, effectivePermissions, effectiveViews,
  hasPermission, isClientOnly, MANAGEABLE_PERMISSIONS, type Permission, type WorkspaceRole,
} from '@/lib/roles'

const perms = (roles: WorkspaceRole[], g: Permission[] = [], r: Permission[] = [], admin = false) =>
  effectivePermissions(roles, g, r, admin)

describe('widoki wg ról', () => {
  it('dostawca/maintainer mają wszystkie widoki', () => {
    expect(allowedViews(['editor'])).toEqual(ALL_VIEWS)
    expect(allowedViews(['workspace_maintainer'])).toEqual(ALL_VIEWS)
  })
  it('klient biznesowy tylko biznesowy; nigdy bezpośredni', () => {
    expect(allowedViews(['client_business'])).toEqual(['client_business'])
    expect(canAccessView(allowedViews(['client_business']), 'direct')).toBe(false)
  })
  it('klient techniczny tylko techniczny', () => {
    expect(allowedViews(['client_technical'])).toEqual(['client_technical'])
  })
  it('brak ról = brak widoków; system-admin = wszystkie', () => {
    expect(allowedViews([])).toEqual([])
    expect(allowedViews([], true)).toEqual(ALL_VIEWS)
  })
})

describe('uprawnienia wg ról (efektywne)', () => {
  it('edytor może edytować i zarządzać stronami', () => {
    expect(canEdit(perms(['editor']))).toBe(true)
    expect(hasPermission(perms(['editor']), 'page-create')).toBe(true)
    expect(hasPermission(perms(['editor']), 'page-delete')).toBe(true)
  })
  it('role klienckie nie edytują ani nie zarządzają stronami', () => {
    expect(canEdit(perms(['client_business']))).toBe(false)
    expect(hasPermission(perms(['client_technical']), 'edit-raw')).toBe(false)
    expect(hasPermission(perms(['client_business']), 'page-create')).toBe(false)
  })
  it('klient techniczny widzi historię, biznesowy nie', () => {
    expect(hasPermission(perms(['client_technical']), 'history-view')).toBe(true)
    expect(hasPermission(perms(['client_business']), 'history-view')).toBe(false)
  })
  it('raporty: domyślnie tylko opiekun; nadawalne i nie eskalujące', () => {
    expect(hasPermission(perms(['workspace_maintainer']), 'reports-view')).toBe(true)
    expect(hasPermission(perms(['editor']), 'reports-view')).toBe(false)
    expect(hasPermission(perms(['client_technical']), 'reports-view')).toBe(false)
    expect(MANAGEABLE_PERMISSIONS).toContain('reports-view')
    // nadanie klientowi działa
    expect(hasPermission(perms(['client_business'], ['reports-view']), 'reports-view')).toBe(true)
  })
  it('system-admin ma wszystko', () => {
    expect(hasPermission([], 'edit-raw', true)).toBe(true)
    expect(canEdit([], true)).toBe(true)
  })
  it('fail-closed: brak ról = brak uprawnień', () => {
    expect(hasPermission(perms([]), 'read')).toBe(false)
    expect(canEdit(perms([]))).toBe(false)
  })
})

describe('override per użytkownik (nadane / odebrane)', () => {
  it('nadanie dodaje uprawnienie do roli klienckiej', () => {
    const p = perms(['client_business'], ['page-create'], [])
    expect(hasPermission(p, 'page-create')).toBe(true)
    expect(hasPermission(p, 'comment')).toBe(true)
  })
  it('odebranie usuwa domyślne uprawnienie roli', () => {
    const p = perms(['editor'], [], ['comment'])
    expect(hasPermission(p, 'comment')).toBe(false)
    expect(hasPermission(p, 'edit-wysiwyg')).toBe(true)
  })
  it('nadane + odebrane jednocześnie', () => {
    const p = perms(['viewer'], ['comment'], ['read'])
    expect(hasPermission(p, 'comment')).toBe(true)
    expect(hasPermission(p, 'read')).toBe(false)
  })
})

describe('override widoków + twarda reguła bezpośredniego', () => {
  it('override ogranicza widoki', () => {
    expect(effectiveViews(['editor'], ['client_business'])).toEqual(['client_business'])
  })
  it('klient NIGDY nie dostaje bezpośredniego, nawet przez override', () => {
    expect(effectiveViews(['client_business'], ['direct', 'client_business'])).toEqual(['client_business'])
    expect(effectiveViews(['client_technical'], ['direct'])).toEqual([])
  })
  it('dostawca może dostać bezpośredni przez override', () => {
    expect(effectiveViews(['editor'], ['direct'])).toEqual(['direct'])
  })
  it('isClientOnly', () => {
    expect(isClientOnly(['client_business'])).toBe(true)
    expect(isClientOnly(['client_business', 'editor'])).toBe(false)
    expect(isClientOnly([])).toBe(false)
  })
})
