import { RouteObject, Navigate } from 'react-router-dom';

const accountSetupRoute: RouteObject = {
  path: '/worklenz/setup',
  element: <Navigate to="/worklenz/home" replace />,
};

export default accountSetupRoute;
