-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 18, 2026 at 12:38 PM
-- Server version: 10.11.16-MariaDB
-- PHP Version: 8.5.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `qr_attendance`
--

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `scanned_at` datetime NOT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `name` varchar(241) DEFAULT NULL,
  `position` varchar(100) NOT NULL,
  `queue_number` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attendance`
--

INSERT INTO `attendance` (`id`, `user_id`, `scanned_at`, `employee_id`, `name`, `position`, `queue_number`) VALUES
(16, 143, '2026-11-14 15:15:19', 'EMP140', 'Bernard John Abellar', 'MBMC Staff', 1),
(17, 4, '2026-11-14 15:15:38', 'EMP001', 'Helen C. Abiog', 'MBMC Staff', 2),
(18, 5, '2026-11-14 15:49:39', 'EMP002', 'Neil E. Adona', 'MBMC Staff', 3),
(19, 6, '2026-11-14 15:49:42', 'EMP003', 'Paul Joyet T. Adoptante', 'MBMC Staff', 4),
(20, 154, '2026-11-16 12:18:48', 'EMP151', 'Vicente Jr. Lopez', 'MBMC Staff', 1),
(21, 154, '2026-11-18 17:47:01', 'EMP151', 'Vicente Jr. Lopez', 'MBMC Staff', 1),
(22, 5, '2026-11-18 17:51:56', 'EMP002', 'Neil E. Adona', 'MBMC Staff', 2);

-- --------------------------------------------------------

--
-- Table structure for table `daily_queue`
--

CREATE TABLE `daily_queue` (
  `queue_date` date NOT NULL,
  `last_number` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `daily_queue`
--

INSERT INTO `daily_queue` (`queue_date`, `last_number`) VALUES
('2026-11-10', 2),
('2026-11-14', 4),
('2026-11-16', 1),
('2026-11-18', 2);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `employee_id` varchar(50) NOT NULL,
  `first_name` varchar(120) NOT NULL,
  `last_name` varchar(120) NOT NULL,
  `position` varchar(100) NOT NULL,
  `photo_filename` varchar(100) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `employee_id`, `first_name`, `last_name`, `position`, `photo_filename`, `email`, `created_at`) VALUES
(4, 'EMP001', 'Helen C.', 'Abiog', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(5, 'EMP002', 'Neil E.', 'Adona', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(6, 'EMP003', 'Paul Joyet T.', 'Adoptante', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(7, 'EMP004', 'Maria Aika P.', 'Adove', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(8, 'EMP005', 'Nikki Ann B.', 'Alas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(9, 'EMP006', 'Darlene Joy T.', 'Albaladejo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(10, 'EMP007', 'Emelio B.', 'Alfanta', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(11, 'EMP008', 'Mac Menard P.', 'Alipustain', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(12, 'EMP009', 'Gio A.', 'Amador', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(13, 'EMP010', 'Armond R.', 'Andulan', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(14, 'EMP011', 'Kris Dianne D.', 'Andulan', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(15, 'EMP012', 'Mary Ann Rosette C.', 'Apellido', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(16, 'EMP013', 'Josephine S.', 'Aragon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(17, 'EMP014', 'Raquel L.', 'Atienza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(18, 'EMP015', 'John Gilbert B.', 'Austria', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(19, 'EMP016', 'Rosette D.', 'Baral', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(20, 'EMP017', 'Marlon P.', 'Barangas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(21, 'EMP018', 'Reymar D.', 'Barredo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(22, 'EMP019', 'Alwin', 'Bascuguin', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(23, 'EMP020', 'Maria Belinda B.', 'Bascuguin', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(24, 'EMP021', 'Nelson D.', 'Beadoy', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(25, 'EMP022', 'Jay H.', 'Beig', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(26, 'EMP023', 'Ariane Marie M.', 'Besas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(27, 'EMP024', 'Leonisa A.', 'Biadoy', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(28, 'EMP025', 'Elena P.', 'Billen', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(29, 'EMP026', 'Belinda D.', 'Bitoon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(30, 'EMP027', 'Paolo Jefferson B.', 'Boter', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(31, 'EMP028', 'Alma Bhel', 'Butor', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(32, 'EMP029', 'Vanessa M.', 'Cabali', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(33, 'EMP030', 'Nerissa L.', 'Cachuela', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(34, 'EMP031', 'Elisa Kathleen F.', 'Callope', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(35, 'EMP032', 'Raven Niña E.', 'Camacho', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(36, 'EMP033', 'Don Robert III L.', 'Capoon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(37, 'EMP034', 'Aris D.', 'Carcabuso', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(38, 'EMP035', 'Cristine T.', 'Carenan', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(39, 'EMP036', 'Ina Jeoane E.', 'Cargado', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(40, 'EMP037', 'Marina B.', 'Carlum', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(41, 'EMP038', 'John Darell A.', 'Casal', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(42, 'EMP039', 'William C.', 'Casal', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(43, 'EMP040', 'Princess Rochelle', 'Castromero', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(44, 'EMP041', 'Chiqui M.', 'Consigo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(45, 'EMP042', 'Donafeah A.', 'Corpuz', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(46, 'EMP043', 'Arron M.', 'Cuello', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(47, 'EMP044', 'Uzziell S.', 'De Jesus', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(48, 'EMP045', 'Mariejo F.', 'De Leon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(49, 'EMP046', 'Renz Alfred B.', 'De Los Reyes', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(50, 'EMP047', 'Abbygeile Joy M.', 'De Vera', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(51, 'EMP048', 'Julie Anne O.', 'Dela Cruz', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(52, 'EMP049', 'Jimmy D.', 'Dela Cuesta', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(53, 'EMP050', 'Elsa B.', 'Dellamas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(54, 'EMP051', 'Divine L.', 'Dellupac', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(55, 'EMP052', 'Kirsten Mattieu', 'Del Rosario', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(56, 'EMP053', 'Andro B.', 'Desonglo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(57, 'EMP054', 'April Marie S.', 'Duran', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(58, 'EMP055', 'Hanna Sheryl R.', 'Ermita', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(59, 'EMP056', 'Modesto D.', 'Esguerra', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(60, 'EMP057', 'Vanezah M.', 'Gamez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(61, 'EMP058', 'Arjay M.', 'Garcia', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(62, 'EMP059', 'Edson A.', 'Gonito', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(63, 'EMP060', 'Brian M.', 'Gozo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(64, 'EMP061', 'Rosemary R.', 'Herjas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(65, 'EMP062', 'Edsel A.', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(66, 'EMP063', 'John B.', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(67, 'EMP064', 'Roan B.', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(68, 'EMP065', 'Samuel D.', 'Ilao', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(69, 'EMP066', 'Federica Angelica T.', 'Inciong', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(70, 'EMP067', 'Jhoanna Mae C.', 'Lagrisola', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(71, 'EMP068', 'Maria Jennifer L.', 'Lagus', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(72, 'EMP069', 'Christian B.', 'Largado', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(73, 'EMP070', 'Johanna Kirsten', 'Laureano', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(74, 'EMP071', 'Rodelando M. Jr.', 'Leuterio', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(75, 'EMP072', 'Jules Nathaniel', 'Liwanag', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(76, 'EMP073', 'Cristine B.', 'Lopez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(77, 'EMP074', 'Joe Erwin B.', 'Lopez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(78, 'EMP075', 'Jomar I.', 'Lopez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(79, 'EMP076', 'Marie Gaille', 'Loteyro', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(80, 'EMP077', 'Joel C.', 'Macalalad', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(81, 'EMP078', 'Kelvin D.', 'Macatangay', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(82, 'EMP079', 'Karla', 'Magsino', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(83, 'EMP080', 'Jean Zaira R.', 'Mangaliman', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(84, 'EMP081', 'Mary Grace', 'Manguerra', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(85, 'EMP082', 'Aprilyn D.', 'Marasigan', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(86, 'EMP083', 'Amelia M.', 'Martinez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(87, 'EMP084', 'Paula Alexandra H.', 'Martinez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(88, 'EMP085', 'Emily C.', 'Medrano', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(89, 'EMP086', 'Gleceria C.', 'Mendoza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(90, 'EMP087', 'Jannela R.', 'Mendoza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(91, 'EMP088', 'Rhoderick A.', 'Mendoza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(92, 'EMP089', 'Alfredo Jr. M.', 'Mercado', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(93, 'EMP090', 'Jeezreel A.', 'Mercado', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(94, 'EMP091', 'Joanna Marie D.', 'Mustard', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(95, 'EMP092', 'Kenneth Dave M.', 'Niala', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(96, 'EMP093', 'Rubelyn A.', 'Nioko', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(97, 'EMP094', 'Johann Ashley S.', 'Noveno', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(98, 'EMP095', 'Alyssa Mae C.', 'Otero', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(99, 'EMP096', 'Nellah Mae C.', 'Otero', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(100, 'EMP097', 'Kathleen Joy R.', 'Pallasa', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(101, 'EMP098', 'Edzel A.', 'Panganiban', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(102, 'EMP099', 'Gennalyn C.', 'Perez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(103, 'EMP100', 'Sherlyn Jane B.', 'Pillazar', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(104, 'EMP101', 'Norielyn G.', 'Raful', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(105, 'EMP102', 'Diana Jean G.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(106, 'EMP103', 'Frank Lee D.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(107, 'EMP104', 'Marjorie A.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(108, 'EMP105', 'Ranz Mario F.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(109, 'EMP106', 'Rosanne B.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(110, 'EMP107', 'Arlon Gil D.', 'Renegado', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(111, 'EMP108', 'Arnold Jr. A.', 'Rivera', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(112, 'EMP109', 'Krisha Mae G.', 'Rodriguez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(113, 'EMP110', 'Ericka B.', 'Salanguit', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(114, 'EMP111', 'Monneth V.', 'Samonteza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(115, 'EMP112', 'Virgilio M.', 'Sanchez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(116, 'EMP113', 'Kimberly B.', 'Señorez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(117, 'EMP114', 'Andrea Nicole B.', 'Signey', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(118, 'EMP115', 'Agnes C.', 'Soriano', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(119, 'EMP116', 'Darwin B.', 'Sta. Ana', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(120, 'EMP117', 'Mario S.', 'Tadas', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(121, 'EMP118', 'Resurreccion P.', 'Tenorio', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(122, 'EMP119', 'Crumwell', 'Tolentino', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(123, 'EMP120', 'Jafet H.', 'Torres', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(124, 'EMP121', 'Rene E.', 'Ungos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(125, 'EMP122', 'Arnold C.', 'Valenzuela', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(126, 'EMP123', 'Nerisa', 'Apego', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(127, 'EMP124', 'Lilia', 'Delos Reyes', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(128, 'EMP125', 'Kimberly', 'Fulgar', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(129, 'EMP126', 'Maria Luisa', 'Ilao', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(130, 'EMP127', 'Bernadette', 'Macalindong', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(131, 'EMP128', 'Baby Alenor', 'Orense', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(132, 'EMP129', 'Matea', 'Perez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(133, 'EMP130', 'John Lloyd', 'Tria', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(134, 'EMP131', 'Ericka Leice P.', 'Palomata', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(135, 'EMP132', 'Arlene M.', 'Corpuz', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(136, 'EMP133', 'Justin', 'Dilig', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(137, 'EMP134', 'Jestonie R.', 'Bendicio', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(138, 'EMP135', 'Julia G.', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(139, 'EMP136', 'Jenny Jane B.', 'Anzaldo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(140, 'EMP137', 'Allysa Jean C.', 'Basco', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(141, 'EMP138', 'Francine Ivy D.', 'Rubion', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(142, 'EMP139', 'Katherine A.', 'Sta. Ana', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(143, 'EMP140', 'Bernard John', 'Abellar', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(144, 'EMP141', 'Aprilyn B.', 'Baral', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(145, 'EMP142', 'James Patrick T.', 'Barcelon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(146, 'EMP143', 'Mikhayla Jirah', 'Bendal', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(147, 'EMP144', 'Miriam Joy', 'Domingo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(148, 'EMP145', 'Diane V.', 'Ilao', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(149, 'EMP146', 'Francia M.', 'Masusi', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(150, 'EMP147', 'Rafaela R.', 'Ramos', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(151, 'EMP148', 'Elionai', 'Papa', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(152, 'EMP149', 'Princes Joyce B.', 'Umandal', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(153, 'EMP150', 'Canandra A.', 'Mangubat', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(154, 'EMP151', 'Vicente Jr.', 'Lopez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(155, 'EMP152', 'Janelle', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(156, 'EMP153', 'James Peter', 'De Leon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(157, 'EMP154', 'Nicole Jane', 'Dime', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(158, 'EMP155', 'Lara Ellaine', 'Beadoy', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(159, 'EMP156', 'Reymond E.', 'Cobol', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(160, 'EMP157', 'Princess', 'Depusoy', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(161, 'EMP158', 'Renz Donald', 'De Regla', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(162, 'EMP159', 'Ma. Nikka Isobelle D.', 'Ramirez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(163, 'EMP160', 'Michaela Roze', 'Del Rosario', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(164, 'EMP161', 'Lorelyn', 'Liyo', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(165, 'EMP162', 'Aprilyn M.', 'Rodriguez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(166, 'EMP163', 'Marianne F.', 'Cosa', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(167, 'EMP164', 'Allysa M.', 'Mendoza', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(168, 'EMP165', 'Cristine Elvie O.', 'Gonowon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(169, 'EMP166', 'KaylaMae', 'Padilla', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(170, 'EMP167', 'Kate Isabela H.', 'Alday', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(171, 'EMP168', 'Maureen Joy S.', 'Yabut', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(172, 'EMP169', 'Kirstie D.', 'Castro', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(173, 'EMP170', 'Jermaine Jed', 'Polon', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(174, 'EMP171', 'Ariane Joy S.', 'Hernandez', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(175, 'EMP172', 'Bernadeth B.', 'Tingco', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(176, 'EMP173', 'Teresa A.', 'Relacion', 'MBMC Staff', NULL, NULL, '2026-11-13 07:10:34'),
(177, 'Admin', 'Admin', 'Admin', 'Admin', NULL, NULL, '2026-11-14 07:57:29');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`,`scanned_at`);

--
-- Indexes for table `daily_queue`
--
ALTER TABLE `daily_queue`
  ADD PRIMARY KEY (`queue_date`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employee_id` (`employee_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=178;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attendance`
--
ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
