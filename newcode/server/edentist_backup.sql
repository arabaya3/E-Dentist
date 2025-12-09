-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: edentist
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `agentclinicassignment`
--

DROP TABLE IF EXISTS `agentclinicassignment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agentclinicassignment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agentId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clinicId` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `AgentClinicAssignment_agentId_key` (`agentId`),
  UNIQUE KEY `AgentClinicAssignment_agentId_clinicId_key` (`agentId`,`clinicId`),
  KEY `AgentClinicAssignment_agentId_idx` (`agentId`),
  KEY `AgentClinicAssignment_clinicId_idx` (`clinicId`),
  CONSTRAINT `AgentClinicAssignment_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agentclinicassignment`
--

LOCK TABLES `agentclinicassignment` WRITE;
/*!40000 ALTER TABLE `agentclinicassignment` DISABLE KEYS */;
/*!40000 ALTER TABLE `agentclinicassignment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agentpageconfig`
--

DROP TABLE IF EXISTS `agentpageconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agentpageconfig` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agentId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `welcomeMessage` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `color` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `image` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `agentAvatar` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `agentName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `provider` enum('ELEVEN_LABS') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ELEVEN_LABS',
  `requiredInfo` json NOT NULL,
  `clinicId` int DEFAULT NULL,
  `gender` enum('Male','Female') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Male',
  `initialGreetingMessage` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `AgentPageConfig_agentId_key` (`agentId`),
  KEY `AgentPageConfig_agentId_idx` (`agentId`),
  KEY `AgentPageConfig_clinicId_fkey` (`clinicId`),
  CONSTRAINT `AgentPageConfig_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agentpageconfig`
--

LOCK TABLES `agentpageconfig` WRITE;
/*!40000 ALTER TABLE `agentpageconfig` DISABLE KEYS */;
/*!40000 ALTER TABLE `agentpageconfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointment`
--

DROP TABLE IF EXISTS `appointment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appointment_raw_details` json NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointment`
--

LOCK TABLES `appointment` WRITE;
/*!40000 ALTER TABLE `appointment` DISABLE KEYS */;
INSERT INTO `appointment` VALUES (1,'{\"date\": \"2025-01-10\", \"time\": \"14:00\", \"doctor\": \"Dr. Ahmad\", \"service\": \"Teeth Cleaning\", \"clientName\": \"Mohammed\"}','2025-11-19 10:56:45.803','2025-11-19 10:56:45.000');
/*!40000 ALTER TABLE `appointment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clinic`
--

DROP TABLE IF EXISTS `clinic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clinic` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `affiliateClinicAccessEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `photo` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clinic`
--

LOCK TABLES `clinic` WRITE;
/*!40000 ALTER TABLE `clinic` DISABLE KEYS */;
INSERT INTO `clinic` VALUES (2,'Smile Dental Clinic',0,'2025-11-19 10:55:25.643','2025-11-19 10:55:25.000',NULL),(3,'Happy Teeth Center',0,'2025-11-19 10:55:25.643','2025-11-19 10:55:25.000',NULL),(4,'Jordan Dental Care',0,'2025-11-19 10:55:25.643','2025-11-19 10:55:25.000',NULL);
/*!40000 ALTER TABLE `clinic` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clinicpermission`
--

DROP TABLE IF EXISTS `clinicpermission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clinicpermission` (
  `clinicId` int NOT NULL,
  `permissionId` int NOT NULL,
  PRIMARY KEY (`clinicId`,`permissionId`),
  KEY `ClinicPermission_permissionId_fkey` (`permissionId`),
  CONSTRAINT `ClinicPermission_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ClinicPermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `permission` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clinicpermission`
--

LOCK TABLES `clinicpermission` WRITE;
/*!40000 ALTER TABLE `clinicpermission` DISABLE KEYS */;
/*!40000 ALTER TABLE `clinicpermission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contactus`
--

DROP TABLE IF EXISTS `contactus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contactus` (
  `id` int NOT NULL AUTO_INCREMENT,
  `firstName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `phoneNumber` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT '',
  `position` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `subject` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contactus`
--

LOCK TABLES `contactus` WRITE;
/*!40000 ALTER TABLE `contactus` DISABLE KEYS */;
/*!40000 ALTER TABLE `contactus` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `countrypricing`
--

DROP TABLE IF EXISTS `countrypricing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `countrypricing` (
  `id` int NOT NULL AUTO_INCREMENT,
  `country` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency` enum('BHD','SAR','AED','QAR','KWD','OMR','USD') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pricing` double NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `CountryPricing_country_key` (`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `countrypricing`
--

LOCK TABLES `countrypricing` WRITE;
/*!40000 ALTER TABLE `countrypricing` DISABLE KEYS */;
/*!40000 ALTER TABLE `countrypricing` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permission`
--

DROP TABLE IF EXISTS `permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permission` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Permission_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permission`
--

LOCK TABLES `permission` WRITE;
/*!40000 ALTER TABLE `permission` DISABLE KEYS */;
/*!40000 ALTER TABLE `permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report`
--

DROP TABLE IF EXISTS `report`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `anterior_teeth_raw` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upper_teeth_raw` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lower_teeth_raw` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anterior_teeth_labeled` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upper_teeth_labeled` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lower_teeth_labeled` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `result` json DEFAULT NULL,
  `analyzed_issues` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` datetime(3) DEFAULT NULL,
  `type` enum('FREE','PAID') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FREE',
  `userId` int NOT NULL,
  `transactionId` int DEFAULT NULL,
  `status` enum('PENDING','IN_PROGRESS','SUCCESS','FAIL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `error` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Report_userId_fkey` (`userId`),
  KEY `Report_transactionId_fkey` (`transactionId`),
  CONSTRAINT `Report_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `transaction` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Report_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report`
--

LOCK TABLES `report` WRITE;
/*!40000 ALTER TABLE `report` DISABLE KEYS */;
/*!40000 ALTER TABLE `report` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reportreview`
--

DROP TABLE IF EXISTS `reportreview`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reportreview` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reportId` int NOT NULL,
  `userId` int NOT NULL,
  `rating` int NOT NULL,
  `comment` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ReportReview_reportId_key` (`reportId`),
  UNIQUE KEY `ReportReview_reportId_userId_key` (`reportId`,`userId`),
  KEY `ReportReview_userId_fkey` (`userId`),
  CONSTRAINT `ReportReview_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `report` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ReportReview_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reportreview`
--

LOCK TABLES `reportreview` WRITE;
/*!40000 ALTER TABLE `reportreview` DISABLE KEYS */;
/*!40000 ALTER TABLE `reportreview` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction`
--

DROP TABLE IF EXISTS `transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transaction` (
  `id` int NOT NULL AUTO_INCREMENT,
  `result` json DEFAULT NULL,
  `chargeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serviceType` enum('REPORT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` int NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `voucherId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Transaction_chargeId_key` (`chargeId`),
  KEY `chargeId` (`chargeId`),
  KEY `Transaction_userId_fkey` (`userId`),
  KEY `Transaction_voucherId_fkey` (`voucherId`),
  CONSTRAINT `Transaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Transaction_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `voucher` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction`
--

LOCK TABLES `transaction` WRITE;
/*!40000 ALTER TABLE `transaction` DISABLE KEYS */;
/*!40000 ALTER TABLE `transaction` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user`
--

DROP TABLE IF EXISTS `user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mobileNumber` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profileComplete` tinyint(1) NOT NULL DEFAULT '0',
  `verifyCode` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `newMobileNumber` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `language` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT 'en',
  `clinicId` int DEFAULT NULL,
  `isSuperAdmin` tinyint(1) NOT NULL DEFAULT '0',
  `isClinicAdmin` tinyint(1) NOT NULL DEFAULT '0',
  `lastLogin` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  UNIQUE KEY `User_mobileNumber_key` (`mobileNumber`),
  UNIQUE KEY `User_newMobileNumber_key` (`newMobileNumber`),
  KEY `User_clinicId_fkey` (`clinicId`),
  CONSTRAINT `User_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user`
--

LOCK TABLES `user` WRITE;
/*!40000 ALTER TABLE `user` DISABLE KEYS */;
INSERT INTO `user` VALUES (5,'Mohammed Admin','admin@clinic.com','0790000001',NULL,0,NULL,NULL,'ar',2,1,1,NULL,'2025-11-19 11:01:13.000'),(6,'Dr. Ahmad Qasem','ahmad@clinic.com','0790000002',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:01:23.000'),(7,'Sara Reception','sara@clinic.com','0790000003',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:01:29.000'),(11,'Dr. Lina Shreim','lina@clinic.com','0790000004',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:18:34.000'),(12,'Dr. Hani Saeed','hani@clinic.com','0790000005',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:18:34.000'),(13,'Dr. Yousef Al-Dabbas','yousef@clinic.com','0790000006',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:18:34.000'),(23,'Dr. Rawan Salah','rawan.salah@clinic.com','0790000101',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:23:10.000'),(24,'Dr. Saeed Hisham','saeed.hisham@clinic.com','0790000102',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:23:10.000'),(25,'Dr. Mousa Sabri','mousa.sabri@clinic.com','0790000103',NULL,0,NULL,NULL,'ar',2,0,0,NULL,'2025-11-19 11:23:10.000');
/*!40000 ALTER TABLE `user` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `voicecall`
--

DROP TABLE IF EXISTS `voicecall`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `voicecall` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agentId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `conversationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `collectedData` json NOT NULL,
  `provider` enum('ELEVEN_LABS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `clinicId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `VoiceCall_conversationId_key` (`conversationId`),
  KEY `VoiceCall_agentId_idx` (`agentId`),
  KEY `VoiceCall_status_idx` (`status`),
  KEY `VoiceCall_clinicId_idx` (`clinicId`),
  CONSTRAINT `VoiceCall_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `voicecall`
--

LOCK TABLES `voicecall` WRITE;
/*!40000 ALTER TABLE `voicecall` DISABLE KEYS */;
/*!40000 ALTER TABLE `voicecall` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `voucher`
--

DROP TABLE IF EXISTS `voucher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `voucher` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `discountPercentage` double NOT NULL,
  `expirationDate` datetime(3) NOT NULL,
  `seats` int NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `clinicId` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Voucher_code_key` (`code`),
  KEY `code` (`code`),
  KEY `Voucher_clinicId_fkey` (`clinicId`),
  CONSTRAINT `Voucher_clinicId_fkey` FOREIGN KEY (`clinicId`) REFERENCES `clinic` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `voucher`
--

LOCK TABLES `voucher` WRITE;
/*!40000 ALTER TABLE `voucher` DISABLE KEYS */;
/*!40000 ALTER TABLE `voucher` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `waitinglist`
--

DROP TABLE IF EXISTS `waitinglist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `waitinglist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `WaitingList_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `waitinglist`
--

LOCK TABLES `waitinglist` WRITE;
/*!40000 ALTER TABLE `waitinglist` DISABLE KEYS */;
/*!40000 ALTER TABLE `waitinglist` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-11-19 11:31:53
