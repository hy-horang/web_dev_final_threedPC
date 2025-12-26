// API 클라이언트 유틸리티
// 모든 API 호출을 중앙에서 관리

const API_BASE = '';

// 토큰 관리
export const tokenManager = {
  getAccessToken: () => localStorage.getItem('accessToken'),
  getRefreshToken: () => localStorage.getItem('refreshToken'),
  setTokens: (accessToken, refreshToken) => {
    if (accessToken) localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  },
  clearTokens: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  },
  isAuthenticated: () => !!localStorage.getItem('accessToken')
};

// API 요청 헬퍼
async function apiRequest(url, options = {}) {
  const accessToken = tokenManager.getAccessToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers
    });
    
    // 토큰 만료 시 자동 갱신 시도
    if (response.status === 401 && accessToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // 재시도
        headers['Authorization'] = `Bearer ${tokenManager.getAccessToken()}`;
        const retryResponse = await fetch(`${API_BASE}${url}`, {
          ...options,
          headers
        });
        return handleResponse(retryResponse);
      }
    }
    
    return handleResponse(response);
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  
  const data = isJson ? await response.json() : await response.text();
  
  if (!response.ok) {
    const error = new Error(data.error || data.message || 'API request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  
  return data;
}

async function refreshAccessToken() {
  const refreshToken = tokenManager.getRefreshToken();
  if (!refreshToken) {
    tokenManager.clearTokens();
    return false;
  }
  
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (response.ok) {
      const data = await response.json();
      tokenManager.setTokens(data.accessToken, null);
      return true;
    }
  } catch (error) {
    console.error('Token refresh failed:', error);
  }
  
  tokenManager.clearTokens();
  return false;
}

// 인증 API
export const authAPI = {
  // Google 로그인은 firebase-auth.js에서 처리
  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      tokenManager.clearTokens();
    }
  },
  getProfile: async () => {
    return apiRequest('/api/profile');
  },
  updateProfile: async (userId, data) => {
    return apiRequest(`/api/profile/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};

// 상품 API
export const productAPI = {
  getList: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/products?${query}`);
  },
  getDetail: async (id) => {
    return apiRequest(`/api/products/${id}`);
  },
  getPriceHistory: async (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/products/${id}/price-history?${query}`);
  },
  getRelated: async (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/products/${id}/related?${query}`);
  },
  create: async (data) => {
    return apiRequest('/api/products', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  update: async (id, data) => {
    return apiRequest(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  delete: async (id) => {
    return apiRequest(`/api/products/${id}`, { method: 'DELETE' });
  },
  toggleLike: async (id) => {
    return apiRequest(`/api/products/${id}/like`, { method: 'POST' });
  },
  getComments: async (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/products/${id}/comments?${query}`);
  },
  createComment: async (id, content) => {
    return apiRequest(`/api/products/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }
};

// 카테고리 API
export const categoryAPI = {
  getList: async () => {
    return apiRequest('/api/categories');
  },
  create: async (data) => {
    return apiRequest('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  update: async (id, data) => {
    return apiRequest(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};

// 견적서 API
export const quoteAPI = {
  create: async (data) => {
    return apiRequest('/api/quotes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  getList: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/quotes?${query}`);
  },
  getMyQuotes: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/quotes/me?${query}`);
  },
  getDetail: async (id) => {
    return apiRequest(`/api/quotes/${id}`);
  },
  getByShareUuid: async (uuid) => {
    return apiRequest(`/api/quotes/share/${uuid}`);
  },
  update: async (id, data) => {
    return apiRequest(`/api/quotes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  delete: async (id) => {
    return apiRequest(`/api/quotes/${id}`, { method: 'DELETE' });
  },
  addItem: async (id, productId, quantity = 1) => {
    return apiRequest(`/api/quotes/${id}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId, quantity })
    });
  },
  removeItem: async (id, itemId) => {
    return apiRequest(`/api/quotes/${id}/items/${itemId}`, { method: 'DELETE' });
  },
  updateItemQuantity: async (id, itemId, quantity) => {
    return apiRequest(`/api/quotes/${id}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    });
  },
  toggleLike: async (id) => {
    return apiRequest(`/api/quotes/${id}/like`, { method: 'POST' });
  },
  getComments: async (id, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/quotes/${id}/comments?${query}`);
  },
  createComment: async (id, content) => {
    return apiRequest(`/api/quotes/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  },
  copy: async (id) => {
    return apiRequest(`/api/quotes/${id}/copy`, { method: 'POST' });
  }
};

// 호환성 검사 API
export const compatibilityAPI = {
  check: async (quoteId) => {
    return apiRequest(`/api/compatibility/check?quoteId=${quoteId}`);
  }
};

// 좋아요 API
export const likeAPI = {
  getMyLikes: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/users/me/likes?${query}`);
  }
};

// 관리자 API
export const adminAPI = {
  getUsers: async () => {
    return apiRequest('/admin/users');
  },
  updateUserRole: async (userId, role) => {
    return apiRequest(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
  }
};

